import type { ParsedCandidateBoundary } from "../../enrichment-contract";
import {
  ENRICHED_MODE_SEMVER_GATE,
  PARSED_CANDIDATE_REJECTION_REASONS,
} from "../../enrichment-contract";

type FailureCategory =
  | "malformed_or_unusable_input"
  | "missing_or_disabled_config"
  | "timeout"
  | "quota_or_provider_error"
  | "malformed_provider_response"
  | "no_result";

type FailureOutcomeKind = "error-envelope" | "diagnostic-no-op" | "no-op" | "throw";

type ThrowErrorClassName =
  | "EmptyInputError"
  | "InvalidGoogleMapsUrlError"
  | "UnsupportedGoogleMapsUrlError"
  | "DisallowedHostnameError";

interface FailureOutcomeContract {
  readonly kind: FailureOutcomeKind;
  readonly errorCode: string | null;
  readonly errorClassName: ThrowErrorClassName | null;
  readonly diagnosticCodes: readonly string[];
  readonly providerErrorStatuses: readonly string[];
  readonly rawGeocodingStatus: string | null;
  readonly notes: string;
}

interface FailureContractCase {
  readonly id: string;
  readonly category: FailureCategory;
  readonly safeApi: FailureOutcomeContract;
  readonly throwApi: FailureOutcomeContract;
  readonly upstreamAnchors: readonly string[];
}

interface ParsedCandidateBoundaryContract {
  readonly shapeVersion: "parsed-candidate-boundary-v1";
  readonly fieldOrder: readonly [
    "source",
    "url",
    "intent",
    "location",
    "queryText",
    "placeHint",
    "routeHint",
  ];
  readonly excludes: readonly ["plusCode"];
  readonly rejectionReasons: typeof PARSED_CANDIDATE_REJECTION_REASONS;
  readonly populatedShapeExamples: readonly ParsedCandidateShapeExample[];
}

interface ParsedCandidateShapeExample {
  readonly id:
    | "query-text-shape"
    | "location-shape"
    | "place-hint-shape"
    | "route-hint-shape";
  readonly inputUrl: string;
  readonly expected: ParsedCandidateBoundary;
  readonly upstreamAnchors: readonly string[];
}

interface SemverGateContract {
  readonly gateVersion: "enriched-mode-semver-v1";
  readonly gate: typeof ENRICHED_MODE_SEMVER_GATE;
  readonly releaseArtifactProof: {
    readonly packageName: "google-maps-link-parser";
    readonly packageVersion: "0.1.2";
    readonly expectedTarballFileName: "google-maps-link-parser-0.1.2.tgz";
    readonly proofCommand: "npm pack --json";
    readonly requiredPackFields: readonly ["filename", "integrity", "shasum"];
    readonly notes: string;
  };
  readonly releasePolicy: {
    readonly patchWhen: "existing_opt_in_enriched_mode_contract_preserved";
    readonly minorWhen: "opt_in_enriched_mode_contract_changes";
    readonly minorRequiresExplicitChangelogCallout: true;
  };
}

interface Phase2ContractDesignArtifact {
  readonly version: "phase2-contract-design-v1";
  readonly capturedAt: "2026-03-10";
  readonly purpose: string;
  readonly evidencePolicy: {
    readonly policyVersion: "evidence-anchors-v1";
    readonly allowedAnchorPrefixes: readonly [
      "phase2-contract-design-gate.test.ts::",
      "parser.test.ts::",
      "unfurl.test.ts::",
      "analyze.test.ts::",
      "parser.ts::",
      "analyze.ts::",
      "enrich.ts::",
    ];
    readonly notes: string;
  };
  readonly parsedCandidateBoundary: ParsedCandidateBoundaryContract;
  readonly failureContract: readonly FailureContractCase[];
  readonly semverGate: SemverGateContract;
}

export const PHASE2_CONTRACT_DESIGN: Phase2ContractDesignArtifact = {
  version: "phase2-contract-design-v1",
  capturedAt: "2026-03-10",
  purpose:
    "Design gate only: lock parsed candidate boundary, failure contract, and semver rules before enrichment behavior changes.",
  evidencePolicy: {
    policyVersion: "evidence-anchors-v1",
    allowedAnchorPrefixes: [
      "phase2-contract-design-gate.test.ts::",
      "parser.test.ts::",
      "unfurl.test.ts::",
      "analyze.test.ts::",
      "parser.ts::",
      "analyze.ts::",
      "enrich.ts::",
    ],
    notes:
      "Evidence anchors must point to checked-in tests or source symbols in this package; placeholder or ambiguous anchors are not allowed.",
  },
  parsedCandidateBoundary: {
    shapeVersion: "parsed-candidate-boundary-v1",
    fieldOrder: [
      "source",
      "url",
      "intent",
      "location",
      "queryText",
      "placeHint",
      "routeHint",
    ],
    excludes: ["plusCode"],
    rejectionReasons: PARSED_CANDIDATE_REJECTION_REASONS,
    populatedShapeExamples: [
      {
        id: "query-text-shape",
        inputUrl: "https://www.google.com/maps?q=Malaz+Riyadh",
        expected: {
          source: "input",
          url: "https://www.google.com/maps?q=Malaz+Riyadh",
          intent: "search",
          location: null,
          queryText: {
            text: "Malaz Riyadh",
            source: "q-param",
          },
          placeHint: null,
          routeHint: null,
        },
        upstreamAnchors: [
          "parser.test.ts::extracts human query text instead of treating it as coordinates",
        ],
      },
      {
        id: "location-shape",
        inputUrl: "https://www.google.com/maps/@24.7136,46.6753,15z",
        expected: {
          source: "input",
          url: "https://www.google.com/maps/@24.7136,46.6753,15z",
          intent: "coordinates",
          location: {
            latitude: 24.7136,
            longitude: 46.6753,
            source: "at-pattern",
          },
          queryText: null,
          placeHint: null,
          routeHint: null,
        },
        upstreamAnchors: ["parser.test.ts::extracts coordinates from direct @ URLs"],
      },
      {
        id: "place-hint-shape",
        inputUrl:
          "https://www.google.com/maps/place/%D8%AD%D9%8A+%D8%A7%D9%84%D9%85%D9%84%D8%A7%D8%B2/data=!4m2!3m1!1s0x123:0x456",
        expected: {
          source: "input",
          url: "https://www.google.com/maps/place/%D8%AD%D9%8A+%D8%A7%D9%84%D9%85%D9%84%D8%A7%D8%B2/data=!4m2!3m1!1s0x123:0x456",
          intent: "place",
          location: null,
          queryText: null,
          placeHint: {
            title: "حي الملاز",
            formattedAddress: null,
          },
          routeHint: null,
        },
        upstreamAnchors: [
          "parser.test.ts::extracts decoded place-path text for geocoding fallback",
        ],
      },
      {
        id: "route-hint-shape",
        inputUrl: "https://www.google.com/maps/dir/Riyadh/Diriyah?travelmode=driving",
        expected: {
          source: "input",
          url: "https://www.google.com/maps/dir/Riyadh/Diriyah?travelmode=driving",
          intent: "directions",
          location: null,
          queryText: null,
          placeHint: null,
          routeHint: {
            originText: "Riyadh",
            destinationText: "Diriyah",
            travelMode: "driving",
          },
        },
        upstreamAnchors: ["parser.test.ts::parses directions URLs into route data"],
      },
    ],
  },
  failureContract: [
    {
      id: "empty-input",
      category: "malformed_or_unusable_input",
      safeApi: {
        kind: "error-envelope",
        errorCode: "empty_input",
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes: "Safe API must return empty_input for blank or whitespace-only input.",
      },
      throwApi: {
        kind: "throw",
        errorCode: "empty_input",
        errorClassName: "EmptyInputError",
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes:
          "Throw API must fail fast with EmptyInputError for blank or whitespace-only input.",
      },
      upstreamAnchors: [
        "parser.ts::parseGoogleMapsUrl trims empty input and returns EmptyInputError envelope",
        "phase2-contract-design-gate.test.ts::failure contract lock: empty-input",
      ],
    },
    {
      id: "invalid-url",
      category: "malformed_or_unusable_input",
      safeApi: {
        kind: "error-envelope",
        errorCode: "invalid_url",
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes: "Safe API must return invalid_url for non-URL input that is not blank.",
      },
      throwApi: {
        kind: "throw",
        errorCode: "invalid_url",
        errorClassName: "InvalidGoogleMapsUrlError",
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes:
          "Throw API must fail fast with InvalidGoogleMapsUrlError for malformed URL input.",
      },
      upstreamAnchors: [
        "parser.ts::parseGoogleMapsUrl safeParseUrl failure returns InvalidGoogleMapsUrlError envelope",
        "phase2-contract-design-gate.test.ts::failure contract lock: invalid-url",
      ],
    },
    {
      id: "unsupported-google-maps-url",
      category: "malformed_or_unusable_input",
      safeApi: {
        kind: "error-envelope",
        errorCode: "unsupported_url",
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes:
          "Safe API must return unsupported_url for recognized-but-unsupported public Google Maps inputs.",
      },
      throwApi: {
        kind: "throw",
        errorCode: "unsupported_url",
        errorClassName: "UnsupportedGoogleMapsUrlError",
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes:
          "Throw API must fail with UnsupportedGoogleMapsUrlError for unsupported Google Maps URLs.",
      },
      upstreamAnchors: [
        "parser.test.ts::returns a safe error envelope for unsupported share.google URLs",
        "parser.test.ts::throws in the throw variant for unsupported URLs",
      ],
    },
    {
      id: "disallowed-hostname-input",
      category: "malformed_or_unusable_input",
      safeApi: {
        kind: "error-envelope",
        errorCode: "disallowed_hostname",
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes:
          "Safe API must return disallowed_hostname for suffix-spoofed or unsafe hosts.",
      },
      throwApi: {
        kind: "throw",
        errorCode: "disallowed_hostname",
        errorClassName: "DisallowedHostnameError",
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes:
          "Throw API must fail with DisallowedHostnameError and preserve host context.",
      },
      upstreamAnchors: [
        "parser.test.ts::rejects suffix-spoofed hosts",
        "parser.test.ts::preserves rejected hostname in throw variant typed errors",
      ],
    },
    {
      id: "missing-config",
      category: "missing_or_disabled_config",
      safeApi: {
        kind: "diagnostic-no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: ["enrichment_not_configured"],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes:
          "Enriched mode without config is an explicit diagnostic no-op, not a throw.",
      },
      throwApi: {
        kind: "diagnostic-no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: ["enrichment_not_configured"],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes: "Throw API keeps parity here: diagnostic no-op, no exception.",
      },
      upstreamAnchors: [
        "analyze.test.ts::enriched mode without provider config stays safe and loud",
      ],
    },
    {
      id: "disabled-config",
      category: "missing_or_disabled_config",
      safeApi: {
        kind: "no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes:
          "Explicitly disabled providers are a silent no-op baseline for this phase.",
      },
      throwApi: {
        kind: "no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes: "Throw API mirrors disabled-provider no-op behavior.",
      },
      upstreamAnchors: [
        "phase2-contract-design-gate.test.ts::failure contract lock: disabled-config",
      ],
    },
    {
      id: "provider-timeout",
      category: "timeout",
      safeApi: {
        kind: "diagnostic-no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: ["geocoding_request_failed"],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes:
          "Provider timeout is represented as a diagnostic no-op and does not throw.",
      },
      throwApi: {
        kind: "diagnostic-no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: ["geocoding_request_failed"],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes:
          "Throw API also treats provider timeout as diagnostic no-op inside enrichment.",
      },
      upstreamAnchors: [
        "enrich.ts::createProviderInfrastructureDiagnostic",
        "analyze.ts::enriched branch relies on enrichment diagnostics for provider failures",
      ],
    },
    {
      id: "provider-quota-denied",
      category: "quota_or_provider_error",
      safeApi: {
        kind: "diagnostic-no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: ["geocoding_denied"],
        providerErrorStatuses: ["REQUEST_DENIED"],
        rawGeocodingStatus: null,
        notes: "Provider quota/auth denial is captured as warning diagnostic and no-op.",
      },
      throwApi: {
        kind: "diagnostic-no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: ["geocoding_denied"],
        providerErrorStatuses: ["REQUEST_DENIED"],
        rawGeocodingStatus: null,
        notes:
          "Throw API preserves diagnostic no-op behavior for denied provider responses.",
      },
      upstreamAnchors: [
        "analyze.test.ts::captures provider denied responses without crashing",
      ],
    },
    {
      id: "provider-quota-over-limit",
      category: "quota_or_provider_error",
      safeApi: {
        kind: "diagnostic-no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: ["geocoding_denied"],
        providerErrorStatuses: ["OVER_QUERY_LIMIT"],
        rawGeocodingStatus: null,
        notes:
          "Quota-style provider status is frozen as denied diagnostic behavior, not throw.",
      },
      throwApi: {
        kind: "diagnostic-no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: ["geocoding_denied"],
        providerErrorStatuses: ["OVER_QUERY_LIMIT"],
        rawGeocodingStatus: null,
        notes: "Throw API also keeps OVER_QUERY_LIMIT in diagnostic no-op contract.",
      },
      upstreamAnchors: [
        "enrich.ts::interpretProviderBody treats non-OK/non-empty statuses as denied",
      ],
    },
    {
      id: "provider-malformed-body",
      category: "malformed_provider_response",
      safeApi: {
        kind: "no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes:
          "Malformed provider body is currently treated as empty response and no-op.",
      },
      throwApi: {
        kind: "no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: null,
        notes: "Throw API also keeps malformed provider response as no-op.",
      },
      upstreamAnchors: [
        "enrich.ts::callGoogleProvider returns kind=empty when body is non-object",
      ],
    },
    {
      id: "provider-no-result-zero-results",
      category: "no_result",
      safeApi: {
        kind: "no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: "ZERO_RESULTS",
        notes:
          "ZERO_RESULTS must remain an explicit no-op outcome (no diagnostics, no throw).",
      },
      throwApi: {
        kind: "no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: "ZERO_RESULTS",
        notes: "Throw API keeps ZERO_RESULTS responses as no-op.",
      },
      upstreamAnchors: [
        "enrich.ts::interpretProviderBody maps ZERO_RESULTS and NOT_FOUND to empty",
        "phase2-contract-design-gate.test.ts::no-result statuses remain no-op outcomes",
      ],
    },
    {
      id: "provider-no-result-not-found",
      category: "no_result",
      safeApi: {
        kind: "no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: "NOT_FOUND",
        notes:
          "NOT_FOUND must remain an explicit no-op outcome (no diagnostics, no throw).",
      },
      throwApi: {
        kind: "no-op",
        errorCode: null,
        errorClassName: null,
        diagnosticCodes: [],
        providerErrorStatuses: [],
        rawGeocodingStatus: "NOT_FOUND",
        notes: "Throw API keeps NOT_FOUND responses as no-op.",
      },
      upstreamAnchors: [
        "enrich.ts::interpretProviderBody maps ZERO_RESULTS and NOT_FOUND to empty",
        "phase2-contract-design-gate.test.ts::no-result statuses remain no-op outcomes",
      ],
    },
  ],
  semverGate: {
    gateVersion: "enriched-mode-semver-v1",
    gate: ENRICHED_MODE_SEMVER_GATE,
    releaseArtifactProof: {
      packageName: "google-maps-link-parser",
      packageVersion: "0.1.2",
      expectedTarballFileName: "google-maps-link-parser-0.1.2.tgz",
      proofCommand: "npm pack --json",
      requiredPackFields: ["filename", "integrity", "shasum"],
      notes:
        "RC/release verification must use this exact tarball identity and include filename/integrity/shasum evidence from npm pack JSON output.",
    },
    releasePolicy: {
      patchWhen: "existing_opt_in_enriched_mode_contract_preserved",
      minorWhen: "opt_in_enriched_mode_contract_changes",
      minorRequiresExplicitChangelogCallout: true,
    },
  },
};
