import type {
  Diagnostic,
  ErrorSummary,
  GoogleMapsEnvelope,
  GoogleMapsIntent,
  GoogleMapsMode,
  HostKind,
  InputMetadata,
  LocationData,
  MapViewData,
  NormalizedSection,
  ParseArtifactsRaw,
  PlaceData,
  PlusCode,
  QueryData,
  RawArtifacts,
  ResolutionMetadata,
  RouteData,
  SectionStatus,
} from "./types";

export function createSection<TValue>(
  status: SectionStatus,
  value: TValue | null,
  diagnostics: readonly Diagnostic[] = [],
  provenance: NormalizedSection<TValue>["provenance"] = [],
): NormalizedSection<TValue> {
  return {
    status,
    value,
    diagnostics,
    provenance,
  };
}

export function absentSection<TValue>(): NormalizedSection<TValue> {
  return createSection<TValue>("absent", null);
}

export function notRequestedSection<TValue>(): NormalizedSection<TValue> {
  return createSection<TValue>("not-requested", null);
}

export function createErrorSummary(
  code: string,
  message: string,
  details?: string,
): ErrorSummary {
  if (details === undefined) {
    return { code, message };
  }

  return { code, message, details };
}

export function mergeDiagnostics(
  ...diagnosticSets: ReadonlyArray<readonly Diagnostic[]>
): readonly Diagnostic[] {
  const seen = new Set<string>();
  const merged: Diagnostic[] = [];

  for (const diagnosticSet of diagnosticSets) {
    for (const diagnostic of diagnosticSet) {
      const key = `${diagnostic.code}:${diagnostic.message}:${diagnostic.severity}`;
      if (seen.has(key)) continue;

      seen.add(key);
      merged.push(diagnostic);
    }
  }

  return merged;
}

export function createInputMetadata(args: {
  raw: string;
  normalized: string;
  hostname: string | null;
  hostKind: HostKind;
  isGoogleMapsUrl: boolean;
  isShortLink: boolean;
  canonicalized: string | null;
}): InputMetadata {
  return {
    raw: args.raw,
    normalized: args.normalized,
    hostname: args.hostname,
    hostKind: args.hostKind,
    isGoogleMapsUrl: args.isGoogleMapsUrl,
    isShortLink: args.isShortLink,
    canonicalized: args.canonicalized,
  };
}

export function createResolutionMetadata(args: {
  status: ResolutionMetadata["status"];
  resolvedUrl?: string | null;
  redirectCount?: number;
  finalHttpStatus?: number | null;
  usedHtmlFallback?: boolean;
}): ResolutionMetadata {
  return {
    status: args.status,
    resolvedUrl: args.resolvedUrl ?? null,
    redirectCount: args.redirectCount ?? 0,
    finalHttpStatus: args.finalHttpStatus ?? null,
    usedHtmlFallback: args.usedHtmlFallback ?? false,
  };
}

export function appendRawArtifacts(
  current: RawArtifacts | undefined,
  patch: Partial<RawArtifacts>,
): RawArtifacts | undefined {
  if (
    patch.parse === undefined &&
    patch.redirects === undefined &&
    patch.resolvedUrl === undefined &&
    patch.html === undefined &&
    patch.geocoding === undefined &&
    patch.reverseGeocoding === undefined &&
    patch.places === undefined &&
    patch.directions === undefined &&
    patch.providerErrors === undefined
  ) {
    return current;
  }

  return {
    ...current,
    ...patch,
    providerErrors:
      patch.providerErrors === undefined
        ? current?.providerErrors
        : [...(current?.providerErrors ?? []), ...patch.providerErrors],
  };
}

export function createEnvelope(args: {
  mode: GoogleMapsMode;
  intent: GoogleMapsIntent;
  input: InputMetadata;
  resolution: ResolutionMetadata;
  diagnostics?: readonly Diagnostic[];
  error?: ErrorSummary | null;
  identifiers?: {
    featureId?: string | null;
    placeId?: string | null;
    plusCode?: PlusCode | null;
  };
  location?: NormalizedSection<LocationData>;
  place?: NormalizedSection<PlaceData>;
  route?: NormalizedSection<RouteData>;
  query?: NormalizedSection<QueryData>;
  mapView?: NormalizedSection<MapViewData>;
  raw?: RawArtifacts;
}): GoogleMapsEnvelope {
  return {
    status: args.error ? "error" : "ok",
    mode: args.mode,
    intent: args.intent,
    diagnostics: args.diagnostics ?? [],
    error: args.error ?? null,
    input: args.input,
    resolution: args.resolution,
    identifiers: {
      featureId: args.identifiers?.featureId ?? null,
      placeId: args.identifiers?.placeId ?? null,
      plusCode: args.identifiers?.plusCode ?? null,
    },
    location: args.location ?? absentSection<LocationData>(),
    place: args.place ?? absentSection<PlaceData>(),
    route: args.route ?? absentSection<RouteData>(),
    query: args.query ?? absentSection<QueryData>(),
    mapView: args.mapView ?? absentSection<MapViewData>(),
    raw: args.raw,
  };
}

export function withTopLevelError(
  envelope: GoogleMapsEnvelope,
  error: ErrorSummary,
  diagnostics: readonly Diagnostic[] = [],
  raw?: RawArtifacts,
): GoogleMapsEnvelope {
  return {
    ...envelope,
    status: "error",
    error,
    diagnostics: mergeDiagnostics(envelope.diagnostics, diagnostics),
    raw: appendRawArtifacts(envelope.raw, raw ?? {}),
  };
}

export function withRawParseArtifacts(
  envelope: GoogleMapsEnvelope,
  parseArtifacts: ParseArtifactsRaw | undefined,
): GoogleMapsEnvelope {
  if (parseArtifacts === undefined) return envelope;

  return {
    ...envelope,
    raw: appendRawArtifacts(envelope.raw, { parse: parseArtifacts }),
  };
}
