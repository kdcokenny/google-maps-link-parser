import {
  assertAllowedHostname,
  canonicalizeGoogleMapsUrl,
  classifyHostname,
  isGoogleMapsUrl,
  isShortLinkDomain,
} from "./domain";
import {
  EmptyInputError,
  GoogleMapsUrlError,
  InvalidGoogleMapsUrlError,
  NetworkRequestError,
  NetworkTimeoutError,
  RedirectLimitError,
  UnsupportedGoogleMapsUrlError,
} from "./errors";
import { trimToNull } from "./guards";
import { extractHtmlSignals } from "./html-extract";
import {
  appendRawArtifacts,
  createEnvelope,
  createErrorSummary,
  createInputMetadata,
  createResolutionMetadata,
  mergeDiagnostics,
  withTopLevelError,
} from "./normalize";
import {
  extractCoordsFromUrl,
  extractGeocodeText,
  parseGoogleMapsUrl,
  parseGoogleMapsUrlOrThrow,
} from "./parser";
import type {
  Diagnostic,
  GoogleMapsEnvelope,
  RawArtifacts,
  RedirectHopRaw,
  ResolvedGoogleMapsUrl,
  UnfurlOptions,
} from "./types";

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 5000;

interface FetchStepResult {
  readonly resolvedUrl: string;
  readonly finalHttpStatus: number | null;
  readonly hops: readonly RedirectHopRaw[];
}

interface HtmlFallbackResult extends FetchStepResult {
  readonly usedHtmlFallback: boolean;
  readonly htmlArtifacts?: RawArtifacts["html"];
}

function shouldCaptureRaw(
  options: UnfurlOptions,
  stage: NonNullable<NonNullable<UnfurlOptions["raw"]>["stages"]>[number],
): boolean {
  if (options.raw?.enabled !== true) return false;
  if (options.raw.stages === undefined) return true;
  return options.raw.stages.includes(stage);
}

function normalizeInputOrThrow(rawInput: string): {
  readonly trimmed: string;
  readonly canonicalUrl: string;
} {
  const trimmed = trimToNull(rawInput);
  if (trimmed === null) {
    throw new EmptyInputError();
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new InvalidGoogleMapsUrlError("Input is not a valid URL.", {
      details: trimmed,
    });
  }

  assertAllowedHostname(parsedUrl.hostname);
  if (!isGoogleMapsUrl(trimmed)) {
    throw new UnsupportedGoogleMapsUrlError(
      "URL is not a supported public Google Maps link.",
      { details: trimmed },
    );
  }

  return {
    trimmed,
    canonicalUrl: canonicalizeGoogleMapsUrl(trimmed),
  };
}

async function fetchWithTimeout(
  fetchFn: NonNullable<UnfurlOptions["fetch"]>,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchFn(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkTimeoutError(timeoutMs);
    }

    throw new NetworkRequestError("Failed to fetch Google Maps URL.", {
      cause: error,
      details: url,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function followHeadRedirects(
  startUrl: string,
  options: UnfurlOptions,
): Promise<FetchStepResult> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let currentUrl = startUrl;
  const hops: RedirectHopRaw[] = [];

  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- Redirect resolution is inherently sequential.
    const response = await fetchWithTimeout(
      fetchFn,
      currentUrl,
      { method: "HEAD" },
      timeoutMs,
    );

    const locationHeader = response.headers.get("location");
    hops.push({
      requestUrl: currentUrl,
      responseStatus: response.status,
      locationHeader,
    });

    if (response.status < 300 || response.status >= 400) {
      return {
        resolvedUrl: currentUrl,
        finalHttpStatus: response.status,
        hops,
      };
    }

    if (locationHeader === null) {
      return {
        resolvedUrl: currentUrl,
        finalHttpStatus: response.status,
        hops,
      };
    }

    if (hops.length > maxRedirects) {
      throw new RedirectLimitError(maxRedirects);
    }

    const nextUrl = new URL(locationHeader, currentUrl).toString();
    const nextParsed = new URL(nextUrl);
    assertAllowedHostname(nextParsed.hostname);
    currentUrl = nextUrl;
  }
}

async function followGetFallback(
  startUrl: string,
  options: UnfurlOptions,
): Promise<HtmlFallbackResult> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let currentUrl = startUrl;
  const hops: RedirectHopRaw[] = [];
  let geocodeCandidateUrl: string | null =
    extractGeocodeText(currentUrl) === null ? null : currentUrl;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- Redirect resolution is inherently sequential.
    const response = await fetchWithTimeout(
      fetchFn,
      currentUrl,
      {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
        },
      },
      timeoutMs,
    );

    const locationHeader = response.headers.get("location");
    hops.push({
      requestUrl: currentUrl,
      responseStatus: response.status,
      locationHeader,
    });

    if (response.status >= 300 && response.status < 400) {
      if (locationHeader === null) {
        return {
          resolvedUrl: currentUrl,
          finalHttpStatus: response.status,
          hops,
          usedHtmlFallback: false,
        };
      }

      if (hops.length > maxRedirects) {
        throw new RedirectLimitError(maxRedirects);
      }

      const nextUrl = new URL(locationHeader, currentUrl).toString();
      const nextParsed = new URL(nextUrl);
      assertAllowedHostname(nextParsed.hostname);

      if (extractCoordsFromUrl(nextUrl) !== null) {
        return {
          resolvedUrl: nextUrl,
          finalHttpStatus: null,
          hops,
          usedHtmlFallback: false,
        };
      }

      if (extractGeocodeText(nextUrl) !== null) {
        geocodeCandidateUrl = nextUrl;
      }

      currentUrl = nextUrl;
      continue;
    }

    const responseUrl = response.url === "" ? currentUrl : response.url;
    const responseParsed = new URL(responseUrl);
    assertAllowedHostname(responseParsed.hostname);

    if (extractCoordsFromUrl(responseUrl) !== null) {
      return {
        resolvedUrl: responseUrl,
        finalHttpStatus: response.status,
        hops,
        usedHtmlFallback: false,
      };
    }

    // eslint-disable-next-line no-await-in-loop -- A single terminal response body is read after sequential redirects.
    const body = await response.text();
    const htmlSignals = extractHtmlSignals(body);

    if (htmlSignals.location !== null) {
      return {
        resolvedUrl: htmlSignals.geocodeCandidateUrl ?? responseUrl,
        finalHttpStatus: response.status,
        hops,
        usedHtmlFallback: true,
        htmlArtifacts: htmlSignals.artifacts,
      };
    }

    if (htmlSignals.geocodeCandidateUrl !== null) {
      return {
        resolvedUrl: htmlSignals.geocodeCandidateUrl,
        finalHttpStatus: response.status,
        hops,
        usedHtmlFallback: true,
        htmlArtifacts: htmlSignals.artifacts,
      };
    }

    return {
      resolvedUrl: geocodeCandidateUrl ?? responseUrl,
      finalHttpStatus: response.status,
      hops,
      usedHtmlFallback: false,
      htmlArtifacts:
        htmlSignals.artifacts.extractedUrls.length === 0 &&
        htmlSignals.artifacts.observations.length === 0
          ? undefined
          : htmlSignals.artifacts,
    };
  }
}

function createUnfurlErrorEnvelope(
  rawInput: string,
  error: GoogleMapsUrlError,
): GoogleMapsEnvelope {
  const hostname = (() => {
    try {
      return new URL(trimToNull(rawInput) ?? "").hostname;
    } catch {
      return null;
    }
  })();

  const hostKind = hostname === null ? "unknown" : classifyHostname(hostname);
  const normalized = trimToNull(rawInput) ?? "";

  const baseEnvelope = createEnvelope({
    mode: "unfurl",
    intent: "unknown",
    input: createInputMetadata({
      raw: normalized,
      normalized,
      hostname,
      hostKind,
      isGoogleMapsUrl: hostname === null ? false : isGoogleMapsUrl(normalized),
      isShortLink: hostname === null ? false : isShortLinkDomain(hostname),
      canonicalized: null,
    }),
    resolution: createResolutionMetadata({
      status:
        error.code === "network_error" || error.code === "network_timeout"
          ? "error"
          : "not-attempted",
    }),
  });

  return withTopLevelError(baseEnvelope, createErrorSummary(error.code, error.message));
}

function createNetworkErrorEnvelope(
  rawInput: string,
  error: unknown,
): GoogleMapsEnvelope {
  if (error instanceof GoogleMapsUrlError) {
    return createUnfurlErrorEnvelope(rawInput, error);
  }

  const wrappedError = new NetworkRequestError("Unexpected Google Maps unfurl failure.", {
    cause: error,
    details: trimToNull(rawInput) ?? "",
  });
  return createUnfurlErrorEnvelope(rawInput, wrappedError);
}

function createResolutionDiagnostics(args: {
  usedHtmlFallback: boolean;
  finalHttpStatus: number | null;
  resolvedUrl: string;
  requestedUrl: string;
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (args.usedHtmlFallback) {
    diagnostics.push({
      code: "html_fallback_used",
      message: "HTML shell fallback was used to improve resolution.",
      severity: "info",
    });
  }

  if (args.finalHttpStatus !== null && args.finalHttpStatus >= 400) {
    diagnostics.push({
      code: "dead_shortlink",
      message: `Final Google Maps response returned HTTP ${args.finalHttpStatus}.`,
      severity: "warning",
    });
  }

  if (args.resolvedUrl !== args.requestedUrl) {
    diagnostics.push({
      code: "resolved_url_changed",
      message: "Public Google Maps resolution changed the effective URL.",
      severity: "info",
    });
  }

  return diagnostics;
}

export async function resolveGoogleMapsUrl(
  rawInput: string,
  options: UnfurlOptions = {},
): Promise<ResolvedGoogleMapsUrl> {
  const normalized = normalizeInputOrThrow(rawInput);
  const requestedUrl = normalized.canonicalUrl;
  const inputIsShortLink = isShortLinkDomain(new URL(requestedUrl).hostname);

  if (!inputIsShortLink) {
    const directCoords = extractCoordsFromUrl(requestedUrl);
    if (directCoords !== null || options.enableHtmlFallback !== true) {
      const rawArtifacts =
        options.raw?.enabled === true
          ? appendRawArtifacts(
              undefined,
              shouldCaptureRaw(options, "resolved-url")
                ? { resolvedUrl: { finalUrl: requestedUrl } }
                : {},
            )
          : undefined;

      return {
        inputUrl: trimToNull(rawInput) ?? rawInput,
        canonicalUrl: requestedUrl,
        resolvedUrl: requestedUrl,
        redirectCount: 0,
        finalHttpStatus: null,
        usedHtmlFallback: false,
        raw: rawArtifacts,
      };
    }

    const getResult = await followGetFallback(requestedUrl, options);
    let rawArtifacts: RawArtifacts | undefined;
    if (shouldCaptureRaw(options, "resolved-url")) {
      rawArtifacts = appendRawArtifacts(rawArtifacts, {
        resolvedUrl: { finalUrl: getResult.resolvedUrl },
      });
    }
    if (shouldCaptureRaw(options, "html") && getResult.htmlArtifacts !== undefined) {
      rawArtifacts = appendRawArtifacts(rawArtifacts, {
        html: getResult.htmlArtifacts,
      });
    }

    return {
      inputUrl: trimToNull(rawInput) ?? rawInput,
      canonicalUrl: requestedUrl,
      resolvedUrl: getResult.resolvedUrl,
      redirectCount: getResult.hops.length,
      finalHttpStatus: getResult.finalHttpStatus,
      usedHtmlFallback: getResult.usedHtmlFallback,
      raw: rawArtifacts,
    };
  }

  const headResult = await followHeadRedirects(requestedUrl, options);
  const headHasDirectCoords = extractCoordsFromUrl(headResult.resolvedUrl) !== null;

  if (
    headHasDirectCoords ||
    (headResult.finalHttpStatus !== null && headResult.finalHttpStatus >= 400)
  ) {
    let rawArtifacts: RawArtifacts | undefined;
    if (shouldCaptureRaw(options, "redirects")) {
      rawArtifacts = appendRawArtifacts(rawArtifacts, {
        redirects: {
          hops: headResult.hops,
          finalHttpStatus: headResult.finalHttpStatus,
        },
      });
    }
    if (shouldCaptureRaw(options, "resolved-url")) {
      rawArtifacts = appendRawArtifacts(rawArtifacts, {
        resolvedUrl: { finalUrl: headResult.resolvedUrl },
      });
    }

    return {
      inputUrl: trimToNull(rawInput) ?? rawInput,
      canonicalUrl: requestedUrl,
      resolvedUrl: headResult.resolvedUrl,
      redirectCount: headResult.hops.length,
      finalHttpStatus: headResult.finalHttpStatus,
      usedHtmlFallback: false,
      raw: rawArtifacts,
    };
  }

  const getResult = await followGetFallback(headResult.resolvedUrl, options);
  let rawArtifacts: RawArtifacts | undefined;
  if (shouldCaptureRaw(options, "redirects")) {
    rawArtifacts = appendRawArtifacts(rawArtifacts, {
      redirects: {
        hops: [...headResult.hops, ...getResult.hops],
        finalHttpStatus: getResult.finalHttpStatus ?? headResult.finalHttpStatus,
      },
    });
  }
  if (shouldCaptureRaw(options, "resolved-url")) {
    rawArtifacts = appendRawArtifacts(rawArtifacts, {
      resolvedUrl: { finalUrl: getResult.resolvedUrl },
    });
  }
  if (shouldCaptureRaw(options, "html") && getResult.htmlArtifacts !== undefined) {
    rawArtifacts = appendRawArtifacts(rawArtifacts, {
      html: getResult.htmlArtifacts,
    });
  }

  return {
    inputUrl: trimToNull(rawInput) ?? rawInput,
    canonicalUrl: requestedUrl,
    resolvedUrl: getResult.resolvedUrl,
    redirectCount: headResult.hops.length + getResult.hops.length,
    finalHttpStatus: getResult.finalHttpStatus ?? headResult.finalHttpStatus,
    usedHtmlFallback: getResult.usedHtmlFallback,
    raw: rawArtifacts,
  };
}

function upgradeEnvelopeMode(
  envelope: GoogleMapsEnvelope,
  mode: GoogleMapsEnvelope["mode"],
): GoogleMapsEnvelope {
  if (envelope.mode === mode) return envelope;
  return { ...envelope, mode };
}

export async function unfurlGoogleMapsUrlOrThrow(
  rawInput: string,
  options: UnfurlOptions = {},
): Promise<GoogleMapsEnvelope> {
  const minimalEnvelope = parseGoogleMapsUrlOrThrow(rawInput, options);
  const requestedUrl = minimalEnvelope.input.normalized;
  const requestedIsShortLink = minimalEnvelope.input.isShortLink;

  if (!requestedIsShortLink && options.enableHtmlFallback !== true) {
    return upgradeEnvelopeMode(
      {
        ...minimalEnvelope,
        resolution: createResolutionMetadata({
          status: "not-needed",
          resolvedUrl: requestedUrl,
        }),
      },
      "unfurl",
    );
  }

  const resolved = await resolveGoogleMapsUrl(rawInput, options);
  const resolvedParsed = parseGoogleMapsUrl(resolved.resolvedUrl, options);
  const resolutionStatus =
    resolved.finalHttpStatus !== null && resolved.finalHttpStatus >= 400
      ? "dead-end"
      : requestedIsShortLink ||
          resolved.usedHtmlFallback ||
          resolved.resolvedUrl !== requestedUrl
        ? "resolved"
        : "not-needed";

  const diagnostics = createResolutionDiagnostics({
    usedHtmlFallback: resolved.usedHtmlFallback,
    finalHttpStatus: resolved.finalHttpStatus,
    resolvedUrl: resolved.resolvedUrl,
    requestedUrl,
  });

  if (resolvedParsed.status === "error") {
    const unresolvedRaw = appendRawArtifacts(minimalEnvelope.raw, resolved.raw ?? {});
    const unresolvedEnvelope = createEnvelope({
      mode: "unfurl",
      intent: minimalEnvelope.intent,
      input: createInputMetadata({
        raw: minimalEnvelope.input.raw,
        normalized: requestedUrl,
        hostname: minimalEnvelope.input.hostname,
        hostKind: minimalEnvelope.input.hostKind,
        isGoogleMapsUrl: minimalEnvelope.input.isGoogleMapsUrl,
        isShortLink: minimalEnvelope.input.isShortLink,
        canonicalized: minimalEnvelope.input.canonicalized,
      }),
      resolution: createResolutionMetadata({
        status: resolutionStatus,
        resolvedUrl: resolved.resolvedUrl,
        redirectCount: resolved.redirectCount,
        finalHttpStatus: resolved.finalHttpStatus,
        usedHtmlFallback: resolved.usedHtmlFallback,
      }),
      diagnostics,
      identifiers: {
        featureId: minimalEnvelope.identifiers.featureId,
        placeId: null,
        plusCode: minimalEnvelope.identifiers.plusCode,
      },
      location: minimalEnvelope.location,
      place: minimalEnvelope.place,
      route: minimalEnvelope.route,
      query: minimalEnvelope.query,
      mapView: minimalEnvelope.mapView,
      ...(unresolvedRaw === undefined ? {} : { raw: unresolvedRaw }),
    });

    return unresolvedEnvelope;
  }

  return {
    ...upgradeEnvelopeMode(resolvedParsed, "unfurl"),
    input: createInputMetadata({
      raw: minimalEnvelope.input.raw,
      normalized: requestedUrl,
      hostname: minimalEnvelope.input.hostname,
      hostKind: minimalEnvelope.input.hostKind,
      isGoogleMapsUrl: minimalEnvelope.input.isGoogleMapsUrl,
      isShortLink: minimalEnvelope.input.isShortLink,
      canonicalized: minimalEnvelope.input.canonicalized,
    }),
    resolution: createResolutionMetadata({
      status: resolutionStatus,
      resolvedUrl: resolved.resolvedUrl,
      redirectCount: resolved.redirectCount,
      finalHttpStatus: resolved.finalHttpStatus,
      usedHtmlFallback: resolved.usedHtmlFallback,
    }),
    diagnostics: mergeDiagnostics(resolvedParsed.diagnostics, diagnostics),
    raw: appendRawArtifacts(resolvedParsed.raw, resolved.raw ?? {}),
  };
}

export async function unfurlGoogleMapsUrl(
  rawInput: string,
  options: UnfurlOptions = {},
): Promise<GoogleMapsEnvelope> {
  try {
    return await unfurlGoogleMapsUrlOrThrow(rawInput, options);
  } catch (error) {
    return createNetworkErrorEnvelope(rawInput, error);
  }
}

export const resolveGoogleMapsUrlOrThrow: typeof resolveGoogleMapsUrl =
  resolveGoogleMapsUrl;
