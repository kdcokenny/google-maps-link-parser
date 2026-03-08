export type GoogleMapsMode = "minimal" | "unfurl" | "enriched";

export type EnrichmentPolicy = "when-needed" | "always";

export type GoogleMapsIntent =
  | "coordinates"
  | "place"
  | "search"
  | "directions"
  | "map"
  | "streetview"
  | "unknown";

export type ResultStatus = "ok" | "error";

export type SectionStatus =
  | "present"
  | "absent"
  | "not-requested"
  | "unsupported"
  | "error";

export type DiagnosticSeverity = "info" | "warning" | "error";

export type HostKind =
  | "standard"
  | "shortlink"
  | "unsupported-shortlink"
  | "disallowed"
  | "unknown";

export type ResolutionStatus =
  | "not-attempted"
  | "not-needed"
  | "resolved"
  | "dead-end"
  | "error";

export type Confidence = "high" | "medium" | "weak";

export type RawStage =
  | "parse"
  | "redirects"
  | "resolved-url"
  | "html"
  | "geocoding"
  | "reverse-geocoding"
  | "places"
  | "directions"
  | "provider-error";

export type CoordinateSource =
  | "at-pattern"
  | "query-param"
  | "data-param"
  | "place-path"
  | "ll-param"
  | "destination-param"
  | "viewpoint-param"
  | "html-json-ld"
  | "html-geo-intent"
  | "html-data-param"
  | "html-app-state"
  | "html-center-pattern"
  | "html-app-initialization-state"
  | "provider-geocoding"
  | "provider-places";

export type QueryTextSource =
  | "q-param"
  | "query-param"
  | "destination-param"
  | "origin-param"
  | "place-path";

export type MapAction = "map" | "pano";

export type TravelMode = "driving" | "walking" | "bicycling" | "transit" | "two-wheeler";

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: DiagnosticSeverity;
  readonly details?: string | undefined;
}

export interface ProvenanceRecord {
  readonly stage: RawStage | "canonicalize" | "detect-intent" | "normalize";
  readonly source: string;
  readonly confidence: Confidence;
  readonly url?: string | undefined;
}

export interface NormalizedSection<TValue> {
  readonly status: SectionStatus;
  readonly value: TValue | null;
  readonly provenance: readonly ProvenanceRecord[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface LocationData extends Coordinates {
  readonly source: CoordinateSource;
  readonly accuracy: "exact" | "approximate";
}

export interface AddressComponent {
  readonly longName: string;
  readonly shortName: string;
  readonly types: readonly string[];
}

export interface PlusCode {
  readonly globalCode: string | null;
  readonly compoundCode: string | null;
}

export interface PlaceData {
  readonly title: string | null;
  readonly formattedAddress: string | null;
  readonly featureId: string | null;
  readonly placeId: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly country: string | null;
  readonly types: readonly string[];
  readonly plusCode: PlusCode | null;
}

export interface RouteData {
  readonly originText: string | null;
  readonly destinationText: string | null;
  readonly waypoints: readonly string[];
  readonly travelMode: TravelMode | null;
  readonly distanceMeters: number | null;
  readonly durationSeconds: number | null;
  readonly polyline: string | null;
}

export interface QueryData {
  readonly text: string | null;
  readonly source: QueryTextSource | null;
  readonly isCoordinateQuery: boolean;
  readonly mapAction: MapAction | null;
}

export interface MapViewData {
  readonly center: LocationData | null;
  readonly zoom: number | null;
  readonly heading: number | null;
  readonly pitch: number | null;
  readonly panoId: string | null;
  readonly mapAction: MapAction | null;
}

export interface ErrorSummary {
  readonly code: string;
  readonly message: string;
  readonly details?: string | undefined;
}

export interface RedirectHopRaw {
  readonly requestUrl: string;
  readonly responseStatus: number;
  readonly locationHeader: string | null;
}

export interface ParseArtifactsRaw {
  readonly canonicalizedInput: string;
  readonly matchedPattern: string | null;
  readonly detectedPatterns: readonly string[];
}

export interface ResolutionArtifactsRaw {
  readonly hops: readonly RedirectHopRaw[];
  readonly finalHttpStatus: number | null;
}

export interface HtmlObservationRaw {
  readonly kind: string;
  readonly value: string;
}

export interface HtmlArtifactsRaw {
  readonly extractedUrls: readonly string[];
  readonly observations: readonly HtmlObservationRaw[];
}

export interface ProviderRawArtifact {
  readonly requestUrl: string;
  readonly providerStatus: string | null;
  readonly body: unknown;
}

export interface ProviderDeniedRawArtifact {
  readonly provider: "geocoding" | "reverse-geocoding" | "places" | "directions";
  readonly providerStatus: string;
  readonly errorMessage: string | null;
  readonly body: unknown;
}

export interface RawArtifacts {
  readonly parse?: ParseArtifactsRaw | undefined;
  readonly redirects?: ResolutionArtifactsRaw | undefined;
  readonly resolvedUrl?: {
    readonly finalUrl: string;
  };
  readonly html?: HtmlArtifactsRaw | undefined;
  readonly geocoding?: ProviderRawArtifact | undefined;
  readonly reverseGeocoding?: ProviderRawArtifact | undefined;
  readonly places?: ProviderRawArtifact | undefined;
  readonly directions?: ProviderRawArtifact | undefined;
  readonly providerErrors?: readonly ProviderDeniedRawArtifact[] | undefined;
}

export interface InputMetadata {
  readonly raw: string;
  readonly normalized: string;
  readonly hostname: string | null;
  readonly hostKind: HostKind;
  readonly isGoogleMapsUrl: boolean;
  readonly isShortLink: boolean;
  readonly canonicalized: string | null;
}

export interface ResolutionMetadata {
  readonly status: ResolutionStatus;
  readonly resolvedUrl: string | null;
  readonly redirectCount: number;
  readonly finalHttpStatus: number | null;
  readonly usedHtmlFallback: boolean;
}

export interface GoogleMapsEnvelope {
  readonly status: ResultStatus;
  readonly mode: GoogleMapsMode;
  readonly intent: GoogleMapsIntent;
  readonly diagnostics: readonly Diagnostic[];
  readonly error: ErrorSummary | null;
  readonly input: InputMetadata;
  readonly resolution: ResolutionMetadata;
  readonly identifiers: {
    readonly featureId: string | null;
    readonly placeId: string | null;
    readonly plusCode: PlusCode | null;
  };
  readonly location: NormalizedSection<LocationData>;
  readonly place: NormalizedSection<PlaceData>;
  readonly route: NormalizedSection<RouteData>;
  readonly query: NormalizedSection<QueryData>;
  readonly mapView: NormalizedSection<MapViewData>;
  readonly raw?: RawArtifacts | undefined;
}

export type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface RawCaptureOptions {
  readonly enabled?: boolean | undefined;
  readonly stages?: readonly RawStage[] | undefined;
}

export interface ParseOptions {
  readonly raw?: RawCaptureOptions | undefined;
}

export interface UnfurlOptions extends ParseOptions {
  readonly fetch?: FetchFunction | undefined;
  readonly maxRedirects?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly enableHtmlFallback?: boolean | undefined;
}

export interface GoogleApiEnrichmentOptions {
  readonly apiKey: string;
  readonly fetch?: FetchFunction | undefined;
  readonly timeoutMs?: number | undefined;
  readonly region?: string | undefined;
  readonly language?: string | undefined;
  readonly enableReverseGeocoding?: boolean | undefined;
  readonly enableGeocoding?: boolean | undefined;
  readonly enablePlaces?: boolean | undefined;
  readonly enableDirections?: boolean | undefined;
}

export interface AnalyzeOptions extends UnfurlOptions {
  readonly mode?: GoogleMapsMode | undefined;
  readonly enrich?: {
    readonly policy?: EnrichmentPolicy | undefined;
    readonly google?: GoogleApiEnrichmentOptions | undefined;
  };
}

export interface ResolvedGoogleMapsUrl {
  readonly inputUrl: string;
  readonly canonicalUrl: string;
  readonly resolvedUrl: string;
  readonly redirectCount: number;
  readonly finalHttpStatus: number | null;
  readonly usedHtmlFallback: boolean;
  readonly raw?: RawArtifacts | undefined;
}
