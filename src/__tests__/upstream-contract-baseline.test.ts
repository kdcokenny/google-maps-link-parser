import { describe, expect, test } from "bun:test";
import {
  analyzeGoogleMapsUrl,
  enrichGoogleMapsEnvelope,
  parseGoogleMapsUrl,
  unfurlGoogleMapsUrl,
} from "../index";
import type {
  AnalyzeOptions,
  GoogleApiEnrichmentOptions,
  GoogleMapsEnvelope,
  GoogleMapsIntent,
  GoogleMapsMode,
  ResolutionStatus,
} from "../types";
import { DIRECTIONS_OK, GEOCODING_OK, PLACES_OK, PROVIDER_DENIED } from "./fixtures";
import matrix from "./fixtures/upstream-contract-matrix.json";

type ContractSurface = "parse" | "unfurl" | "analyze" | "enrich";
type SemverImpact = "major-breaking" | "minor-additive" | "patch-safe";
type ProviderName = "geocoding" | "reverseGeocoding" | "places" | "directions";
type ProviderResponseKey =
  | "GEOCODING_OK"
  | "PLACES_OK"
  | "DIRECTIONS_OK"
  | "PROVIDER_DENIED";

interface ContractMatrix {
  readonly version: string;
  readonly capturedAt: string;
  readonly purpose: string;
  readonly projectionPolicy: string;
  readonly projectionNotes: string;
  readonly cases: readonly ContractCase[];
}

interface ContractCase {
  readonly id: string;
  readonly surface: ContractSurface;
  readonly inputUrl: string;
  readonly upstreamAnchors: readonly string[];
  readonly parsedCandidate: {
    readonly source: "input" | "resolved-url";
    readonly url: string;
  };
  readonly rawEnabled: boolean;
  readonly resolutionMockSteps?: readonly MockRedirectStep[];
  readonly providerMock?: ProviderMockConfig;
  readonly expected: ProjectedEnvelope;
  readonly expectedContractLocks?: ExpectedContractLocks;
  readonly expectedDiagnostics: readonly string[];
  readonly expectedProviderCalls: ProviderCallCounts;
  readonly semverImpact: SemverImpact;
}

interface MockRedirectStep {
  readonly status: number;
  readonly location?: string;
  readonly body?: string;
}

interface ProviderMockConfig {
  readonly responses: Partial<Record<ProviderName, ProviderResponseKey>>;
  readonly options: {
    readonly enableGeocoding?: boolean;
    readonly enableReverseGeocoding?: boolean;
    readonly enablePlaces?: boolean;
    readonly enableDirections?: boolean;
  };
}

interface ProviderCallCounts {
  geocoding: number;
  reverseGeocoding: number;
  places: number;
  directions: number;
  total: number;
}

interface ProjectedEnvelope {
  readonly status: "ok" | "error";
  readonly mode: GoogleMapsMode;
  readonly intent: GoogleMapsIntent;
  readonly errorCode: string | null;
  readonly inputNormalized: string;
  readonly inputCanonicalized: string | null;
  readonly resolutionStatus: ResolutionStatus;
  readonly resolvedUrl: string | null;
  readonly parsedCandidateUrl: string;
  readonly location: {
    readonly latitude: number;
    readonly longitude: number;
    readonly source: string;
    readonly accuracy: "exact" | "approximate";
  } | null;
  readonly query: {
    readonly text: string | null;
    readonly source: string | null;
    readonly isCoordinateQuery: boolean;
    readonly mapAction: "map" | "pano" | null;
  } | null;
  readonly place: {
    readonly title: string | null;
    readonly formattedAddress: string | null;
    readonly featureId: string | null;
    readonly placeId: string | null;
    readonly district: string | null;
    readonly city: string | null;
    readonly country: string | null;
  } | null;
  readonly route: {
    readonly originText: string | null;
    readonly destinationText: string | null;
    readonly travelMode: string | null;
    readonly distanceMeters: number | null;
    readonly durationSeconds: number | null;
    readonly polyline: string | null;
  } | null;
  readonly parseMatchedPattern: string | null;
  readonly parseDetectedPatterns: readonly string[];
  readonly rawProviderStatuses: {
    readonly geocoding: string | null;
    readonly reverseGeocoding: string | null;
    readonly places: string | null;
    readonly directions: string | null;
    readonly providerErrors: readonly string[];
  };
}

interface ProjectedPlusCode {
  readonly globalCode: string | null;
  readonly compoundCode: string | null;
}

interface ProjectedProviderDeniedArtifact {
  readonly provider: "geocoding" | "reverse-geocoding" | "places" | "directions";
  readonly providerStatus: string;
  readonly errorMessage: string | null;
  readonly body: unknown;
}

interface ExpectedContractLocks {
  readonly identifiers?: {
    readonly placeId: string | null;
    readonly plusCode: ProjectedPlusCode | null;
  };
  readonly place?: {
    readonly types: readonly string[];
    readonly plusCode: ProjectedPlusCode | null;
  };
  readonly rawProviderErrors?: readonly ProjectedProviderDeniedArtifact[];
}

const CONTRACT_MATRIX = matrix as ContractMatrix;

const PROVIDER_BODIES: Record<ProviderResponseKey, unknown> = {
  GEOCODING_OK,
  PLACES_OK,
  DIRECTIONS_OK,
  PROVIDER_DENIED,
};

function createEmptyProviderCallCounts(): ProviderCallCounts {
  return {
    geocoding: 0,
    reverseGeocoding: 0,
    places: 0,
    directions: 0,
    total: 0,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createRedirectFetch(steps: readonly MockRedirectStep[]) {
  let index = 0;

  const fetch = async () => {
    const step = steps[index];
    index += 1;

    if (step === undefined) {
      throw new Error("Unexpected redirect fetch call.");
    }

    return new Response(step.body ?? "", {
      status: step.status,
      headers: step.location === undefined ? {} : { Location: step.location },
    });
  };

  return {
    fetch,
  };
}

function classifyProviderCall(requestUrl: string): ProviderName {
  const parsed = new URL(requestUrl);
  if (parsed.pathname.includes("/directions/")) {
    return "directions";
  }

  if (parsed.pathname.includes("/findplacefromtext/")) {
    return "places";
  }

  if (parsed.pathname.includes("/geocode/")) {
    return parsed.searchParams.has("latlng") ? "reverseGeocoding" : "geocoding";
  }

  throw new Error(`Unexpected provider endpoint: ${requestUrl}`);
}

function createProviderFetch(mock: ProviderMockConfig) {
  const calls = {
    ...createEmptyProviderCallCounts(),
  };

  const fetch = async (input: string | URL | Request) => {
    const requestUrl = typeof input === "string" ? input : String(input);
    const providerName = classifyProviderCall(requestUrl);

    calls.total += 1;
    calls[providerName] += 1;

    const responseKey = mock.responses[providerName];
    if (responseKey === undefined) {
      throw new Error(`Unexpected ${providerName} provider call: ${requestUrl}`);
    }

    return jsonResponse(PROVIDER_BODIES[responseKey]);
  };

  return {
    fetch,
    calls,
  };
}

function projectEnvelope(envelope: GoogleMapsEnvelope): ProjectedEnvelope {
  return {
    status: envelope.status,
    mode: envelope.mode,
    intent: envelope.intent,
    errorCode: envelope.error?.code ?? null,
    inputNormalized: envelope.input.normalized,
    inputCanonicalized: envelope.input.canonicalized,
    resolutionStatus: envelope.resolution.status,
    resolvedUrl: envelope.resolution.resolvedUrl,
    parsedCandidateUrl: envelope.resolution.resolvedUrl ?? envelope.input.normalized,
    location:
      envelope.location.value === null
        ? null
        : {
            latitude: envelope.location.value.latitude,
            longitude: envelope.location.value.longitude,
            source: envelope.location.value.source,
            accuracy: envelope.location.value.accuracy,
          },
    query:
      envelope.query.value === null
        ? null
        : {
            text: envelope.query.value.text,
            source: envelope.query.value.source,
            isCoordinateQuery: envelope.query.value.isCoordinateQuery,
            mapAction: envelope.query.value.mapAction,
          },
    place:
      envelope.place.value === null
        ? null
        : {
            title: envelope.place.value.title,
            formattedAddress: envelope.place.value.formattedAddress,
            featureId: envelope.place.value.featureId,
            placeId: envelope.place.value.placeId,
            district: envelope.place.value.district,
            city: envelope.place.value.city,
            country: envelope.place.value.country,
          },
    route:
      envelope.route.value === null
        ? null
        : {
            originText: envelope.route.value.originText,
            destinationText: envelope.route.value.destinationText,
            travelMode: envelope.route.value.travelMode,
            distanceMeters: envelope.route.value.distanceMeters,
            durationSeconds: envelope.route.value.durationSeconds,
            polyline: envelope.route.value.polyline,
          },
    parseMatchedPattern: envelope.raw?.parse?.matchedPattern ?? null,
    parseDetectedPatterns: [...(envelope.raw?.parse?.detectedPatterns ?? [])],
    rawProviderStatuses: {
      geocoding: envelope.raw?.geocoding?.providerStatus ?? null,
      reverseGeocoding: envelope.raw?.reverseGeocoding?.providerStatus ?? null,
      places: envelope.raw?.places?.providerStatus ?? null,
      directions: envelope.raw?.directions?.providerStatus ?? null,
      providerErrors: (envelope.raw?.providerErrors ?? [])
        .map((item) => `${item.provider}:${item.providerStatus}`)
        .sort(),
    },
  };
}

function projectPlusCode(
  plusCode: GoogleMapsEnvelope["identifiers"]["plusCode"] | null | undefined,
): ProjectedPlusCode | null {
  if (plusCode === null || plusCode === undefined) return null;

  return {
    globalCode: plusCode.globalCode,
    compoundCode: plusCode.compoundCode,
  };
}

function projectProviderDeniedArtifacts(
  envelope: GoogleMapsEnvelope,
): readonly ProjectedProviderDeniedArtifact[] {
  return (envelope.raw?.providerErrors ?? []).map((artifact) => ({
    provider: artifact.provider,
    providerStatus: artifact.providerStatus,
    errorMessage: artifact.errorMessage,
    body: artifact.body,
  }));
}

function sortedDiagnosticCodes(envelope: GoogleMapsEnvelope): readonly string[] {
  return envelope.diagnostics
    .map((item) => item.code)
    .sort((left, right) => left.localeCompare(right));
}

function sortCodes(codes: readonly string[]): readonly string[] {
  return [...codes].sort((left, right) => left.localeCompare(right));
}

describe("upstream contract baseline matrix", () => {
  test("matrix metadata is sane", () => {
    expect(CONTRACT_MATRIX.version).toBe("upstream-baseline-v1");
    expect(CONTRACT_MATRIX.projectionPolicy).toBe("intentional-partial");
    expect(CONTRACT_MATRIX.projectionNotes.length).toBeGreaterThan(0);
    expect(CONTRACT_MATRIX.cases.length).toBeGreaterThan(0);

    const ids = CONTRACT_MATRIX.cases.map((contractCase) => contractCase.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const contractCase of CONTRACT_MATRIX.cases) {
      expect(contractCase.upstreamAnchors.length).toBeGreaterThan(0);
      expect(["major-breaking", "minor-additive", "patch-safe"]).toContain(
        contractCase.semverImpact,
      );
    }
  });

  for (const contractCase of CONTRACT_MATRIX.cases) {
    test(contractCase.id, async () => {
      let envelope: GoogleMapsEnvelope;
      let providerCalls = createEmptyProviderCallCounts();

      switch (contractCase.surface) {
        case "parse": {
          envelope = parseGoogleMapsUrl(contractCase.inputUrl, {
            raw: contractCase.rawEnabled ? { enabled: true } : undefined,
          });
          break;
        }
        case "unfurl": {
          if (contractCase.resolutionMockSteps === undefined) {
            throw new Error("Missing resolutionMockSteps for unfurl contract case.");
          }

          const redirectMock = createRedirectFetch(contractCase.resolutionMockSteps);
          envelope = await unfurlGoogleMapsUrl(contractCase.inputUrl, {
            fetch: redirectMock.fetch,
            raw: contractCase.rawEnabled ? { enabled: true } : undefined,
          });
          break;
        }
        case "analyze": {
          const baseOptions: AnalyzeOptions = {
            mode: "enriched",
            ...(contractCase.rawEnabled ? { raw: { enabled: true } } : {}),
          };

          if (contractCase.providerMock !== undefined) {
            const providerMock = createProviderFetch(contractCase.providerMock);
            providerCalls = providerMock.calls;

            envelope = await analyzeGoogleMapsUrl(contractCase.inputUrl, {
              ...baseOptions,
              enrich: {
                google: {
                  apiKey: "test-key",
                  fetch: providerMock.fetch,
                  ...contractCase.providerMock.options,
                },
              },
            });
            break;
          }

          envelope = await analyzeGoogleMapsUrl(contractCase.inputUrl, baseOptions);
          break;
        }
        case "enrich": {
          if (contractCase.providerMock === undefined) {
            throw new Error("Missing providerMock for enrich contract case.");
          }

          const baseEnvelope = parseGoogleMapsUrl(contractCase.inputUrl, {
            raw: contractCase.rawEnabled ? { enabled: true } : undefined,
          });

          const providerMock = createProviderFetch(contractCase.providerMock);
          providerCalls = providerMock.calls;

          const options: GoogleApiEnrichmentOptions = {
            apiKey: "test-key",
            fetch: providerMock.fetch,
            ...contractCase.providerMock.options,
          };

          envelope = await enrichGoogleMapsEnvelope(baseEnvelope, options);
          break;
        }
        default: {
          const unexpectedSurface: never = contractCase.surface;
          throw new Error(`Unsupported contract surface: ${unexpectedSurface}`);
        }
      }

      const projection = projectEnvelope(envelope);
      expect(projection).toEqual(contractCase.expected);
      expect(projection.parsedCandidateUrl).toBe(contractCase.parsedCandidate.url);
      expect(sortedDiagnosticCodes(envelope)).toEqual(
        sortCodes(contractCase.expectedDiagnostics),
      );

      const contractLocks = contractCase.expectedContractLocks;
      if (contractLocks?.identifiers !== undefined) {
        expect({
          placeId: envelope.identifiers.placeId,
          plusCode: projectPlusCode(envelope.identifiers.plusCode),
        }).toEqual(contractLocks.identifiers);
      }

      if (contractLocks?.place !== undefined) {
        const actualPlaceContract: NonNullable<ExpectedContractLocks["place"]> = {
          types: envelope.place.value?.types ?? [],
          plusCode: projectPlusCode(envelope.place.value?.plusCode),
        };

        expect(actualPlaceContract).toEqual(contractLocks.place);
      }

      if (contractLocks?.rawProviderErrors !== undefined) {
        expect(projectProviderDeniedArtifacts(envelope)).toEqual(
          contractLocks.rawProviderErrors,
        );
      }

      expect(providerCalls).toEqual(contractCase.expectedProviderCalls);
    });
  }
});
