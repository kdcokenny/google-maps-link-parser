import { GoogleMapsUrlError } from "./errors";
import { assertNever, trimToNull } from "./guards";
import { enrichGoogleMapsEnvelope } from "./enrich";
import { mergeDiagnostics } from "./normalize";
import { parseGoogleMapsUrl, parseGoogleMapsUrlOrThrow } from "./parser";
import { unfurlGoogleMapsUrl, unfurlGoogleMapsUrlOrThrow } from "./unfurl";
import type { AnalyzeOptions, Diagnostic, GoogleMapsEnvelope } from "./types";

function ensureRawPreference(
  envelope: GoogleMapsEnvelope,
  rawEnabled: boolean,
): GoogleMapsEnvelope {
  if (!rawEnabled || envelope.raw !== undefined) return envelope;
  return {
    ...envelope,
    raw: {},
  };
}

function withMode(
  envelope: GoogleMapsEnvelope,
  mode: GoogleMapsEnvelope["mode"],
): GoogleMapsEnvelope {
  if (envelope.mode === mode) return envelope;
  return {
    ...envelope,
    mode,
  };
}

function createEnrichmentDiagnostic(
  code: string,
  message: string,
  severity: Diagnostic["severity"],
  details?: string,
): Diagnostic {
  return {
    code,
    message,
    severity,
    details,
  };
}

export async function analyzeGoogleMapsUrlOrThrow(
  rawInput: string,
  options: AnalyzeOptions = {},
): Promise<GoogleMapsEnvelope> {
  const mode = options.mode ?? "minimal";
  const rawEnabled = options.raw?.enabled === true;

  switch (mode) {
    case "minimal":
      return ensureRawPreference(
        parseGoogleMapsUrlOrThrow(rawInput, options),
        rawEnabled,
      );
    case "unfurl":
      return ensureRawPreference(
        await unfurlGoogleMapsUrlOrThrow(rawInput, options),
        rawEnabled,
      );
    case "enriched": {
      const baseEnvelope = ensureRawPreference(
        await unfurlGoogleMapsUrlOrThrow(rawInput, options),
        rawEnabled,
      );

      if (baseEnvelope.status === "error") {
        return withMode(baseEnvelope, "enriched");
      }

      const googleOptions = options.enrich?.google;
      if (googleOptions === undefined) {
        return {
          ...withMode(baseEnvelope, "enriched"),
          diagnostics: mergeDiagnostics(baseEnvelope.diagnostics, [
            createEnrichmentDiagnostic(
              "enrichment_not_configured",
              "Enriched mode was requested without Google API configuration.",
              "warning",
            ),
          ]),
        };
      }

      return await enrichGoogleMapsEnvelope(
        baseEnvelope,
        googleOptions,
        options.enrich?.policy ?? "when-needed",
      );
    }
    default:
      return assertNever(mode, "Unhandled Google Maps analyze mode");
  }
}

export async function analyzeGoogleMapsUrl(
  rawInput: string,
  options: AnalyzeOptions = {},
): Promise<GoogleMapsEnvelope> {
  const mode = options.mode ?? "minimal";
  const rawEnabled = options.raw?.enabled === true;

  if (mode === "minimal") {
    return ensureRawPreference(parseGoogleMapsUrl(rawInput, options), rawEnabled);
  }

  if (mode === "unfurl") {
    return ensureRawPreference(await unfurlGoogleMapsUrl(rawInput, options), rawEnabled);
  }

  const baseEnvelope = ensureRawPreference(
    await unfurlGoogleMapsUrl(rawInput, options),
    rawEnabled,
  );
  if (baseEnvelope.status === "error") {
    return withMode(baseEnvelope, "enriched");
  }

  const googleOptions = options.enrich?.google;
  if (googleOptions === undefined) {
    return {
      ...withMode(baseEnvelope, "enriched"),
      diagnostics: mergeDiagnostics(baseEnvelope.diagnostics, [
        createEnrichmentDiagnostic(
          "enrichment_not_configured",
          "Enriched mode was requested without Google API configuration.",
          "warning",
        ),
      ]),
    };
  }

  try {
    return await enrichGoogleMapsEnvelope(
      baseEnvelope,
      googleOptions,
      options.enrich?.policy ?? "when-needed",
    );
  } catch (error) {
    const diagnostic =
      error instanceof GoogleMapsUrlError
        ? createEnrichmentDiagnostic(
            "enrichment_failed",
            error.message,
            "error",
            error.details,
          )
        : createEnrichmentDiagnostic(
            "enrichment_failed",
            "Unexpected Google Maps enrichment failure.",
            "error",
            trimToNull(rawInput) ?? undefined,
          );

    return {
      ...withMode(baseEnvelope, "enriched"),
      diagnostics: mergeDiagnostics(baseEnvelope.diagnostics, [diagnostic]),
    };
  }
}
