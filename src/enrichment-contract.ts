import type {
  GoogleMapsEnvelope,
  GoogleMapsIntent,
  LocationData,
  QueryTextSource,
  RouteData,
} from "./types";

export type ParsedCandidateSource = "input" | "resolved-url";

export const PARSED_CANDIDATE_REJECTION_REASONS = [
  "error_envelope",
  "missing_candidate_url",
] as const;

export type ParsedCandidateRejectionReason =
  (typeof PARSED_CANDIDATE_REJECTION_REASONS)[number];

export interface ParsedCandidateBoundary {
  readonly source: ParsedCandidateSource;
  readonly url: string;
  readonly intent: GoogleMapsIntent;
  readonly location: {
    readonly latitude: number;
    readonly longitude: number;
    readonly source: LocationData["source"];
  } | null;
  readonly queryText: {
    readonly text: string;
    readonly source: "q-param" | "query-param";
  } | null;
  readonly placeHint: {
    readonly title: string | null;
    readonly formattedAddress: string | null;
  } | null;
  readonly routeHint: {
    readonly originText: string | null;
    readonly destinationText: string | null;
    readonly travelMode: RouteData["travelMode"];
  } | null;
}

export interface ParsedCandidateAccepted {
  readonly kind: "accepted";
  readonly candidate: ParsedCandidateBoundary;
}

export interface ParsedCandidateRejected {
  readonly kind: "rejected";
  readonly reason: ParsedCandidateRejectionReason;
}

export type ParsedCandidateResolution = ParsedCandidateAccepted | ParsedCandidateRejected;

export type ParsedCandidateTextSource = QueryTextSource | "place-title" | "place-address";

export interface ParsedCandidateText {
  readonly text: string;
  readonly source: ParsedCandidateTextSource;
}

export interface ParsedCandidateTextSelection extends ParsedCandidateText {
  readonly candidateSource: ParsedCandidateSource;
  readonly candidateUrl: string;
}

export interface EnrichedModeSemverGate {
  readonly patchRule: "patch_when_opt_in_enriched_contract_is_preserved";
  readonly minorRule: "minor_when_opt_in_enriched_contract_changes";
  readonly minorRequiresExplicitChangelogCallout: true;
}

export const ENRICHED_MODE_SEMVER_GATE: EnrichedModeSemverGate = {
  patchRule: "patch_when_opt_in_enriched_contract_is_preserved",
  minorRule: "minor_when_opt_in_enriched_contract_changes",
  minorRequiresExplicitChangelogCallout: true,
};

export type EnrichedModeReleaseType = "patch" | "minor";

export function classifyEnrichedModeReleaseType(args: {
  readonly preservesOptInEnrichedModeContract: boolean;
}): EnrichedModeReleaseType {
  return args.preservesOptInEnrichedModeContract ? "patch" : "minor";
}

function resolveCandidateUrl(
  envelope: GoogleMapsEnvelope,
  source: ParsedCandidateSource,
): string | null {
  if (source === "input") return envelope.input.normalized;
  return envelope.resolution.resolvedUrl;
}

function toQueryTextCandidate(
  envelope: GoogleMapsEnvelope,
): ParsedCandidateBoundary["queryText"] {
  const queryValue = envelope.query.value;
  if (queryValue === null || queryValue.text === null || queryValue.source === null) {
    return null;
  }

  if (queryValue.source !== "q-param" && queryValue.source !== "query-param") {
    return null;
  }

  return {
    text: queryValue.text,
    source: queryValue.source,
  };
}

const NUMERIC_COORDS_PATTERN = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;
const FTID_PATTERN = /^0x[0-9a-fA-F]+:0x[0-9a-fA-F]+$/;

function normalizeCandidateText(rawValue: string | null): string | null {
  if (rawValue === null) return null;

  const normalized = rawValue.trim();
  if (normalized === "") return null;
  if (normalized.toLowerCase().startsWith("data=!")) return null;
  if (NUMERIC_COORDS_PATTERN.test(normalized)) return null;
  if (FTID_PATTERN.test(normalized)) return null;
  if (normalized.includes("\uFFFD")) return null;

  return normalized;
}

export function selectParsedCandidateText(
  candidate: ParsedCandidateBoundary,
): ParsedCandidateText | null {
  const queryText = normalizeCandidateText(candidate.queryText?.text ?? null);
  if (queryText !== null) {
    return {
      text: queryText,
      source: candidate.queryText?.source ?? "q-param",
    };
  }

  const placeTitle = normalizeCandidateText(candidate.placeHint?.title ?? null);
  if (placeTitle !== null) {
    return {
      text: placeTitle,
      source: "place-title",
    };
  }

  const placeAddress = normalizeCandidateText(
    candidate.placeHint?.formattedAddress ?? null,
  );
  if (placeAddress !== null) {
    return {
      text: placeAddress,
      source: "place-address",
    };
  }

  return null;
}

const DEFAULT_CANDIDATE_SOURCES: readonly ParsedCandidateSource[] = [
  "resolved-url",
  "input",
];

export function selectEnvelopeParsedCandidateText(args: {
  readonly envelope: GoogleMapsEnvelope;
  readonly preferredSources?: readonly ParsedCandidateSource[];
}): ParsedCandidateTextSelection | null {
  const preferredSources = args.preferredSources ?? DEFAULT_CANDIDATE_SOURCES;

  for (const source of preferredSources) {
    const projection = projectParsedCandidateBoundary({
      envelope: args.envelope,
      source,
    });
    if (projection.kind === "rejected") continue;
    if (projection.candidate.location !== null) continue;

    const selectedText = selectParsedCandidateText(projection.candidate);
    if (selectedText === null) continue;

    return {
      ...selectedText,
      candidateSource: source,
      candidateUrl: projection.candidate.url,
    };
  }

  return null;
}

export function projectParsedCandidateBoundary(args: {
  readonly envelope: GoogleMapsEnvelope;
  readonly source: ParsedCandidateSource;
}): ParsedCandidateResolution {
  if (args.envelope.status === "error") {
    return {
      kind: "rejected",
      reason: "error_envelope",
    };
  }

  const candidateUrl = resolveCandidateUrl(args.envelope, args.source);
  if (candidateUrl === null || candidateUrl === "") {
    return {
      kind: "rejected",
      reason: "missing_candidate_url",
    };
  }

  return {
    kind: "accepted",
    candidate: {
      source: args.source,
      url: candidateUrl,
      intent: args.envelope.intent,
      location:
        args.envelope.location.value === null
          ? null
          : {
              latitude: args.envelope.location.value.latitude,
              longitude: args.envelope.location.value.longitude,
              source: args.envelope.location.value.source,
            },
      queryText: toQueryTextCandidate(args.envelope),
      placeHint:
        args.envelope.place.value === null
          ? null
          : {
              title: args.envelope.place.value.title,
              formattedAddress: args.envelope.place.value.formattedAddress,
            },
      routeHint:
        args.envelope.route.value === null
          ? null
          : {
              originText: args.envelope.route.value.originText,
              destinationText: args.envelope.route.value.destinationText,
              travelMode: args.envelope.route.value.travelMode,
            },
    },
  };
}
