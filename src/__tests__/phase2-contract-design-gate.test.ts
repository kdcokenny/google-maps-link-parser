import { describe, expect, test } from "bun:test";
import {
  classifyEnrichedModeReleaseType,
  projectParsedCandidateBoundary,
} from "../enrichment-contract";
import {
  analyzeGoogleMapsUrl,
  analyzeGoogleMapsUrlOrThrow,
  DisallowedHostnameError,
  EmptyInputError,
  GoogleMapsUrlError,
  InvalidGoogleMapsUrlError,
  parseGoogleMapsUrl,
  UnsupportedGoogleMapsUrlError,
} from "../index";
import type { AnalyzeOptions } from "../types";
import { PROVIDER_DENIED, SHORTLINKS, TEXT_URLS } from "./fixtures";
import { PHASE2_CONTRACT_DESIGN } from "./fixtures/phase2-contract-design";

const PROVIDER_QUOTA_OVER_LIMIT = {
  status: "OVER_QUERY_LIMIT",
  error_message: "You have exceeded your daily request quota for this API.",
} as const;

interface ObservedOutcome {
  readonly kind: "error-envelope" | "diagnostic-no-op" | "no-op" | "throw";
  readonly errorCode: string | null;
  readonly errorClassName:
    | "EmptyInputError"
    | "InvalidGoogleMapsUrlError"
    | "UnsupportedGoogleMapsUrlError"
    | "DisallowedHostnameError"
    | null;
  readonly diagnosticCodes: readonly string[];
  readonly providerErrorStatuses: readonly string[];
  readonly rawGeocodingStatus: string | null;
}

function sortCodes(codes: readonly string[]): readonly string[] {
  return [...codes].sort((left, right) => left.localeCompare(right));
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function toAbortError(): Error {
  const error = new Error("Simulated timeout");
  error.name = "AbortError";
  return error;
}

function createTimeoutFetch() {
  return async (
    _input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    return await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(toAbortError());
        return;
      }

      signal?.addEventListener(
        "abort",
        () => {
          reject(toAbortError());
        },
        { once: true },
      );
    });
  };
}

function classifyEnvelopeOutcome(
  result: Awaited<ReturnType<typeof analyzeGoogleMapsUrl>>,
): ObservedOutcome {
  const providerErrorStatuses = sortCodes(
    (result.raw?.providerErrors ?? []).map((item) => item.providerStatus),
  );
  const rawGeocodingStatus = result.raw?.geocoding?.providerStatus ?? null;

  if (result.status === "error") {
    return {
      kind: "error-envelope",
      errorCode: result.error?.code ?? null,
      errorClassName: null,
      diagnosticCodes: sortCodes(result.diagnostics.map((item) => item.code)),
      providerErrorStatuses,
      rawGeocodingStatus,
    };
  }

  const diagnosticCodes = sortCodes(result.diagnostics.map((item) => item.code));
  if (diagnosticCodes.length === 0) {
    return {
      kind: "no-op",
      errorCode: null,
      errorClassName: null,
      diagnosticCodes,
      providerErrorStatuses,
      rawGeocodingStatus,
    };
  }

  return {
    kind: "diagnostic-no-op",
    errorCode: null,
    errorClassName: null,
    diagnosticCodes,
    providerErrorStatuses,
    rawGeocodingStatus,
  };
}

function classifyThrowErrorClassName(error: unknown): ObservedOutcome["errorClassName"] {
  if (error instanceof EmptyInputError) return "EmptyInputError";
  if (error instanceof InvalidGoogleMapsUrlError) return "InvalidGoogleMapsUrlError";
  if (error instanceof UnsupportedGoogleMapsUrlError) {
    return "UnsupportedGoogleMapsUrlError";
  }
  if (error instanceof DisallowedHostnameError) return "DisallowedHostnameError";

  return null;
}

function hasAllowedPrefix(anchor: string, allowedPrefixes: readonly string[]): boolean {
  for (const prefix of allowedPrefixes) {
    if (anchor.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

function toNpmTarballFileName(name: string, version: string): string {
  if (name.startsWith("@")) {
    const scopedName = name.slice(1).replace("/", "-");
    return `${scopedName}-${version}.tgz`;
  }

  return `${name}-${version}.tgz`;
}

function scenarioForCase(caseId: string): {
  readonly inputUrl: string;
  readonly options: AnalyzeOptions;
} {
  switch (caseId) {
    case "empty-input":
      return {
        inputUrl: "   ",
        options: { mode: "enriched" },
      };
    case "invalid-url":
      return {
        inputUrl: "this is not a URL",
        options: { mode: "enriched" },
      };
    case "unsupported-google-maps-url":
      return {
        inputUrl: SHORTLINKS.unsupported,
        options: { mode: "enriched" },
      };
    case "disallowed-hostname-input":
      return {
        inputUrl: "https://google.com.evil/maps",
        options: { mode: "enriched" },
      };
    case "missing-config":
      return {
        inputUrl: TEXT_URLS.queryText,
        options: { mode: "enriched" },
      };
    case "disabled-config":
      return {
        inputUrl: TEXT_URLS.queryText,
        options: {
          mode: "enriched",
          enrich: {
            google: {
              apiKey: "test-key",
              enableGeocoding: false,
              enableReverseGeocoding: false,
              enablePlaces: false,
              enableDirections: false,
              fetch: async () => {
                throw new Error("Disabled providers must not fetch.");
              },
            },
          },
        },
      };
    case "provider-timeout":
      return {
        inputUrl: TEXT_URLS.queryText,
        options: {
          mode: "enriched",
          enrich: {
            google: {
              apiKey: "test-key",
              fetch: createTimeoutFetch(),
              timeoutMs: 1,
              enableReverseGeocoding: false,
              enablePlaces: false,
              enableDirections: false,
            },
          },
        },
      };
    case "provider-quota-denied":
      return {
        inputUrl: TEXT_URLS.queryText,
        options: {
          mode: "enriched",
          raw: { enabled: true },
          enrich: {
            google: {
              apiKey: "bad-key",
              fetch: async () => jsonResponse(PROVIDER_DENIED),
              enableReverseGeocoding: false,
              enablePlaces: false,
              enableDirections: false,
            },
          },
        },
      };
    case "provider-quota-over-limit":
      return {
        inputUrl: TEXT_URLS.queryText,
        options: {
          mode: "enriched",
          raw: { enabled: true },
          enrich: {
            google: {
              apiKey: "quota-key",
              fetch: async () => jsonResponse(PROVIDER_QUOTA_OVER_LIMIT),
              enableReverseGeocoding: false,
              enablePlaces: false,
              enableDirections: false,
            },
          },
        },
      };
    case "provider-malformed-body":
      return {
        inputUrl: TEXT_URLS.queryText,
        options: {
          mode: "enriched",
          enrich: {
            google: {
              apiKey: "test-key",
              fetch: async () => jsonResponse("malformed-provider-body"),
              enableReverseGeocoding: false,
              enablePlaces: false,
              enableDirections: false,
            },
          },
        },
      };
    case "provider-no-result-zero-results":
      return {
        inputUrl: TEXT_URLS.queryText,
        options: {
          mode: "enriched",
          raw: { enabled: true },
          enrich: {
            google: {
              apiKey: "test-key",
              fetch: async () =>
                jsonResponse({
                  status: "ZERO_RESULTS",
                  results: [],
                }),
              enableReverseGeocoding: false,
              enablePlaces: false,
              enableDirections: false,
            },
          },
        },
      };
    case "provider-no-result-not-found":
      return {
        inputUrl: TEXT_URLS.queryText,
        options: {
          mode: "enriched",
          raw: { enabled: true },
          enrich: {
            google: {
              apiKey: "test-key",
              fetch: async () =>
                jsonResponse({
                  status: "NOT_FOUND",
                  results: [],
                }),
              enableReverseGeocoding: false,
              enablePlaces: false,
              enableDirections: false,
            },
          },
        },
      };
    default:
      throw new Error(`Unhandled contract design case: ${caseId}`);
  }
}

async function observeSafeOutcome(caseId: string): Promise<ObservedOutcome> {
  const scenario = scenarioForCase(caseId);
  const result = await analyzeGoogleMapsUrl(scenario.inputUrl, scenario.options);
  return classifyEnvelopeOutcome(result);
}

async function observeThrowOutcome(caseId: string): Promise<ObservedOutcome> {
  const scenario = scenarioForCase(caseId);

  try {
    const result = await analyzeGoogleMapsUrlOrThrow(scenario.inputUrl, scenario.options);
    return classifyEnvelopeOutcome(result);
  } catch (error) {
    return {
      kind: "throw",
      errorCode: error instanceof GoogleMapsUrlError ? error.code : null,
      errorClassName: classifyThrowErrorClassName(error),
      diagnosticCodes: [],
      providerErrorStatuses: [],
      rawGeocodingStatus: null,
    };
  }
}

describe("phase 2 contract design gate", () => {
  test("artifact metadata, evidence policy, and finalized failure IDs are locked", () => {
    expect(PHASE2_CONTRACT_DESIGN.version).toBe("phase2-contract-design-v1");
    expect(PHASE2_CONTRACT_DESIGN.parsedCandidateBoundary.shapeVersion).toBe(
      "parsed-candidate-boundary-v1",
    );
    expect(PHASE2_CONTRACT_DESIGN.evidencePolicy.policyVersion).toBe(
      "evidence-anchors-v1",
    );

    expect(
      PHASE2_CONTRACT_DESIGN.failureContract.map((contractCase) => contractCase.id),
    ).toEqual([
      "empty-input",
      "invalid-url",
      "unsupported-google-maps-url",
      "disallowed-hostname-input",
      "missing-config",
      "disabled-config",
      "provider-timeout",
      "provider-quota-denied",
      "provider-quota-over-limit",
      "provider-malformed-body",
      "provider-no-result-zero-results",
      "provider-no-result-not-found",
    ]);

    for (const contractCase of PHASE2_CONTRACT_DESIGN.failureContract) {
      expect(contractCase.upstreamAnchors.length).toBeGreaterThan(0);
      for (const anchor of contractCase.upstreamAnchors) {
        expect(
          hasAllowedPrefix(
            anchor,
            PHASE2_CONTRACT_DESIGN.evidencePolicy.allowedAnchorPrefixes,
          ),
        ).toBe(true);
      }
    }
  });

  test("parsed candidate boundary populated shapes are locked", () => {
    for (const shapeCase of PHASE2_CONTRACT_DESIGN.parsedCandidateBoundary
      .populatedShapeExamples) {
      expect(shapeCase.upstreamAnchors.length).toBeGreaterThan(0);
      for (const anchor of shapeCase.upstreamAnchors) {
        expect(
          hasAllowedPrefix(
            anchor,
            PHASE2_CONTRACT_DESIGN.evidencePolicy.allowedAnchorPrefixes,
          ),
        ).toBe(true);
      }

      const projection = projectParsedCandidateBoundary({
        envelope: parseGoogleMapsUrl(shapeCase.inputUrl),
        source: shapeCase.expected.source,
      });
      expect(projection.kind).toBe("accepted");
      if (projection.kind !== "accepted") {
        throw new Error(
          `Expected accepted parsed candidate projection for ${shapeCase.id}.`,
        );
      }

      expect(Object.keys(projection.candidate)).toEqual([
        ...PHASE2_CONTRACT_DESIGN.parsedCandidateBoundary.fieldOrder,
      ]);
      expect("plusCode" in projection.candidate).toBe(false);
      expect(projection.candidate).toEqual(shapeCase.expected);
    }
  });

  test("parsed candidate rejection reasons are locked", () => {
    const errorProjection = projectParsedCandidateBoundary({
      envelope: parseGoogleMapsUrl("not a url"),
      source: "input",
    });
    expect(errorProjection).toEqual({
      kind: "rejected",
      reason: "error_envelope",
    });

    const missingResolvedProjection = projectParsedCandidateBoundary({
      envelope: parseGoogleMapsUrl(TEXT_URLS.queryText),
      source: "resolved-url",
    });
    expect(missingResolvedProjection).toEqual({
      kind: "rejected",
      reason: "missing_candidate_url",
    });

    expect(PHASE2_CONTRACT_DESIGN.parsedCandidateBoundary.rejectionReasons).toEqual([
      "error_envelope",
      "missing_candidate_url",
    ]);
  });

  test("empty_input and invalid_url split is explicit for safe and throw APIs", async () => {
    const safeEmptyInput = await observeSafeOutcome("empty-input");
    expect(safeEmptyInput.kind).toBe("error-envelope");
    expect(safeEmptyInput.errorCode).toBe("empty_input");

    const safeInvalidUrl = await observeSafeOutcome("invalid-url");
    expect(safeInvalidUrl.kind).toBe("error-envelope");
    expect(safeInvalidUrl.errorCode).toBe("invalid_url");

    const throwEmptyInput = await observeThrowOutcome("empty-input");
    expect(throwEmptyInput.kind).toBe("throw");
    expect(throwEmptyInput.errorClassName).toBe("EmptyInputError");

    const throwInvalidUrl = await observeThrowOutcome("invalid-url");
    expect(throwInvalidUrl.kind).toBe("throw");
    expect(throwInvalidUrl.errorClassName).toBe("InvalidGoogleMapsUrlError");
  });

  for (const contractCase of PHASE2_CONTRACT_DESIGN.failureContract) {
    test(`failure contract lock: ${contractCase.id}`, async () => {
      const safeOutcome = await observeSafeOutcome(contractCase.id);
      expect(safeOutcome.kind).toBe(contractCase.safeApi.kind);
      expect(safeOutcome.errorCode).toBe(contractCase.safeApi.errorCode);
      expect(safeOutcome.errorClassName).toBe(contractCase.safeApi.errorClassName);
      expect(sortCodes(safeOutcome.diagnosticCodes)).toEqual(
        sortCodes(contractCase.safeApi.diagnosticCodes),
      );
      expect(sortCodes(safeOutcome.providerErrorStatuses)).toEqual(
        sortCodes(contractCase.safeApi.providerErrorStatuses),
      );
      expect(safeOutcome.rawGeocodingStatus).toBe(
        contractCase.safeApi.rawGeocodingStatus,
      );

      const throwOutcome = await observeThrowOutcome(contractCase.id);
      expect(throwOutcome.kind).toBe(contractCase.throwApi.kind);
      expect(throwOutcome.errorCode).toBe(contractCase.throwApi.errorCode);
      expect(throwOutcome.errorClassName).toBe(contractCase.throwApi.errorClassName);
      expect(sortCodes(throwOutcome.diagnosticCodes)).toEqual(
        sortCodes(contractCase.throwApi.diagnosticCodes),
      );
      expect(sortCodes(throwOutcome.providerErrorStatuses)).toEqual(
        sortCodes(contractCase.throwApi.providerErrorStatuses),
      );
      expect(throwOutcome.rawGeocodingStatus).toBe(
        contractCase.throwApi.rawGeocodingStatus,
      );
    });
  }

  test("no-result statuses remain no-op outcomes", async () => {
    const zeroResultsOutcome = await observeSafeOutcome(
      "provider-no-result-zero-results",
    );
    expect(zeroResultsOutcome.kind).toBe("no-op");
    expect(zeroResultsOutcome.diagnosticCodes).toEqual([]);
    expect(zeroResultsOutcome.rawGeocodingStatus).toBe("ZERO_RESULTS");

    const notFoundOutcome = await observeSafeOutcome("provider-no-result-not-found");
    expect(notFoundOutcome.kind).toBe("no-op");
    expect(notFoundOutcome.diagnosticCodes).toEqual([]);
    expect(notFoundOutcome.rawGeocodingStatus).toBe("NOT_FOUND");
  });

  test("semver gate and release artifact proof are explicit", async () => {
    expect(PHASE2_CONTRACT_DESIGN.semverGate.gate.patchRule).toBe(
      "patch_when_opt_in_enriched_contract_is_preserved",
    );
    expect(PHASE2_CONTRACT_DESIGN.semverGate.gate.minorRule).toBe(
      "minor_when_opt_in_enriched_contract_changes",
    );
    expect(
      PHASE2_CONTRACT_DESIGN.semverGate.releasePolicy
        .minorRequiresExplicitChangelogCallout,
    ).toBe(true);

    expect(
      classifyEnrichedModeReleaseType({
        preservesOptInEnrichedModeContract: true,
      }),
    ).toBe("patch");
    expect(
      classifyEnrichedModeReleaseType({
        preservesOptInEnrichedModeContract: false,
      }),
    ).toBe("minor");

    const packageJson = (await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json()) as {
      readonly name: string;
      readonly version: string;
    };

    const releaseArtifactProof = PHASE2_CONTRACT_DESIGN.semverGate.releaseArtifactProof;
    expect(packageJson.name).toBe(releaseArtifactProof.packageName);
    expect(packageJson.version).toBe(releaseArtifactProof.packageVersion);
    expect(toNpmTarballFileName(packageJson.name, packageJson.version)).toBe(
      releaseArtifactProof.expectedTarballFileName,
    );
    expect(releaseArtifactProof.proofCommand).toBe("npm pack --json");
    expect(releaseArtifactProof.requiredPackFields).toEqual([
      "filename",
      "integrity",
      "shasum",
    ]);
  });
});
