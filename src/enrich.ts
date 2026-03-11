import { selectEnvelopeParsedCandidateText } from "./enrichment-contract";
import { NetworkRequestError, NetworkTimeoutError } from "./errors";
import { trimToNull } from "./guards";
import { appendRawArtifacts, createSection, mergeDiagnostics } from "./normalize";
import type {
  Diagnostic,
  EnrichmentPolicy,
  FetchFunction,
  GoogleApiEnrichmentOptions,
  GoogleMapsEnvelope,
  LocationData,
  PlaceData,
  PlusCode,
  ProviderDeniedRawArtifact,
  ProviderRawArtifact,
  RouteData,
  TravelMode,
} from "./types";

const DEFAULT_PROVIDER_TIMEOUT_MS = 5000;
const DEFAULT_REGION = "us";
const DEFAULT_LANGUAGE = "en";

interface GoogleStatusBody {
  readonly status?: string;
  readonly error_message?: string;
}

interface ProviderSuccess<TBody> {
  readonly kind: "success";
  readonly requestUrl: string;
  readonly providerStatus: string | null;
  readonly body: TBody;
}

interface ProviderEmpty {
  readonly kind: "empty";
  readonly requestUrl: string;
  readonly providerStatus: string | null;
  readonly body: unknown;
}

interface ProviderDenied {
  readonly kind: "denied";
  readonly raw: ProviderDeniedRawArtifact;
}

type ProviderOutcome<TBody> = ProviderSuccess<TBody> | ProviderEmpty | ProviderDenied;

type ProviderName = ProviderDeniedRawArtifact["provider"];

interface GeocodingAddressComponent {
  readonly long_name?: string;
  readonly short_name?: string;
  readonly types?: readonly string[];
}

interface GeocodingResultBody extends GoogleStatusBody {
  readonly results?: ReadonlyArray<{
    readonly formatted_address?: string;
    readonly place_id?: string;
    readonly types?: readonly string[];
    readonly plus_code?: {
      readonly global_code?: string;
      readonly compound_code?: string;
    };
    readonly geometry?: {
      readonly location?: {
        readonly lat?: number;
        readonly lng?: number;
      };
    };
    readonly address_components?: ReadonlyArray<GeocodingAddressComponent>;
  }>;
}

interface PlacesFindResultBody extends GoogleStatusBody {
  readonly candidates?: ReadonlyArray<{
    readonly place_id?: string;
    readonly name?: string;
    readonly formatted_address?: string;
    readonly types?: readonly string[];
    readonly geometry?: {
      readonly location?: {
        readonly lat?: number;
        readonly lng?: number;
      };
    };
    readonly plus_code?: {
      readonly global_code?: string;
      readonly compound_code?: string;
    };
  }>;
}

interface DirectionsResultBody extends GoogleStatusBody {
  readonly routes?: ReadonlyArray<{
    readonly overview_polyline?: {
      readonly points?: string;
    };
    readonly legs?: ReadonlyArray<{
      readonly distance?: {
        readonly value?: number;
      };
      readonly duration?: {
        readonly value?: number;
      };
    }>;
  }>;
}

function shouldCaptureRaw(
  envelope: GoogleMapsEnvelope,
  _stage: "geocoding" | "reverse-geocoding" | "places" | "directions" | "provider-error",
): boolean {
  return envelope.raw !== undefined;
}

function createProviderRawArtifact(
  requestUrl: string,
  body: unknown,
): ProviderRawArtifact {
  const providerStatus = isObject(body) ? asString(body["status"]) : null;
  return {
    requestUrl,
    providerStatus,
    body,
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTravelMode(mode: TravelMode | null): string | null {
  if (mode === null) return null;
  if (mode === "two-wheeler") return "two_wheeler";
  return mode;
}

function plusCodeFromUnknown(value: unknown): PlusCode | null {
  if (!isObject(value)) return null;

  return {
    globalCode: asString(value["global_code"]),
    compoundCode: asString(value["compound_code"]),
  };
}

function addressComponent(
  components: ReadonlyArray<GeocodingAddressComponent> | undefined,
  types: readonly string[],
): string | null {
  if (components === undefined) return null;

  for (const desiredType of types) {
    const match = components.find((component) => component.types?.includes(desiredType));
    if (match?.long_name !== undefined) return match.long_name;
  }

  return null;
}

async function fetchJsonWithTimeout(
  fetchFn: FetchFunction,
  requestUrl: string,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(requestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    const body = await response.json();
    if (!response.ok) {
      throw new NetworkRequestError(
        `Google provider request failed with HTTP ${response.status}.`,
        {
          details: requestUrl,
        },
      );
    }

    return body;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkTimeoutError(timeoutMs);
    }
    if (error instanceof NetworkRequestError || error instanceof NetworkTimeoutError) {
      throw error;
    }
    throw new NetworkRequestError("Google provider request failed.", {
      cause: error,
      details: requestUrl,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function interpretProviderBody<TBody extends GoogleStatusBody>(args: {
  provider: ProviderName;
  requestUrl: string;
  body: TBody;
}): ProviderOutcome<TBody> {
  const providerStatus = asString(args.body.status);

  if (providerStatus === null || providerStatus === "OK") {
    return {
      kind: "success",
      requestUrl: args.requestUrl,
      providerStatus,
      body: args.body,
    };
  }

  if (providerStatus === "ZERO_RESULTS" || providerStatus === "NOT_FOUND") {
    return {
      kind: "empty",
      requestUrl: args.requestUrl,
      providerStatus,
      body: args.body,
    };
  }

  return {
    kind: "denied",
    raw: {
      provider: args.provider,
      providerStatus,
      errorMessage: asString(args.body.error_message),
      body: args.body,
    },
  };
}

async function callGoogleProvider<TBody extends GoogleStatusBody>(args: {
  provider: ProviderName;
  requestUrl: string;
  fetchFn: FetchFunction;
  timeoutMs: number;
}): Promise<ProviderOutcome<TBody>> {
  const body = await fetchJsonWithTimeout(args.fetchFn, args.requestUrl, args.timeoutMs);
  if (!isObject(body)) {
    return {
      kind: "empty",
      requestUrl: args.requestUrl,
      providerStatus: null,
      body,
    };
  }

  return interpretProviderBody({
    provider: args.provider,
    requestUrl: args.requestUrl,
    body: body as TBody,
  });
}

function shouldRunByPolicy(args: {
  currentHasValue: boolean;
  policy: EnrichmentPolicy;
  explicitlyEnabled: boolean | undefined;
  defaultWhenNeeded: boolean;
}): boolean {
  if (args.explicitlyEnabled === false) return false;
  if (args.explicitlyEnabled === true) return true;
  if (args.policy === "always") return args.defaultWhenNeeded;
  if (args.currentHasValue) return false;
  return args.defaultWhenNeeded;
}

function createProviderErrorDiagnostic(error: ProviderDeniedRawArtifact): Diagnostic {
  return {
    code: `${error.provider}_denied`,
    message: `${error.provider} returned ${error.providerStatus}.`,
    severity: "warning",
    details: error.errorMessage ?? undefined,
  };
}

function createProviderInfrastructureDiagnostic(
  provider: ProviderName,
  error: NetworkRequestError | NetworkTimeoutError,
): Diagnostic {
  return {
    code: `${provider}_request_failed`,
    message: error.message,
    severity: "error",
    details: error.details,
  };
}

function mergePlaceValue(
  current: PlaceData | null,
  patch: Partial<PlaceData>,
): PlaceData {
  return {
    title: patch.title ?? current?.title ?? null,
    formattedAddress: patch.formattedAddress ?? current?.formattedAddress ?? null,
    featureId: patch.featureId ?? current?.featureId ?? null,
    placeId: patch.placeId ?? current?.placeId ?? null,
    district: patch.district ?? current?.district ?? null,
    city: patch.city ?? current?.city ?? null,
    country: patch.country ?? current?.country ?? null,
    types: patch.types ?? current?.types ?? [],
    plusCode: patch.plusCode ?? current?.plusCode ?? null,
  };
}

function mergeRouteValue(
  current: RouteData | null,
  patch: Partial<RouteData>,
): RouteData {
  return {
    originText: patch.originText ?? current?.originText ?? null,
    destinationText: patch.destinationText ?? current?.destinationText ?? null,
    waypoints: patch.waypoints ?? current?.waypoints ?? [],
    travelMode: patch.travelMode ?? current?.travelMode ?? null,
    distanceMeters: patch.distanceMeters ?? current?.distanceMeters ?? null,
    durationSeconds: patch.durationSeconds ?? current?.durationSeconds ?? null,
    polyline: patch.polyline ?? current?.polyline ?? null,
  };
}

function createProviderLocation(
  latitude: number,
  longitude: number,
  source: LocationData["source"],
): LocationData {
  return {
    latitude,
    longitude,
    source,
    accuracy: source === "provider-geocoding" ? "approximate" : "exact",
  };
}

function locationFromGeocodingResult(
  result: NonNullable<GeocodingResultBody["results"]>[number] | undefined,
  source: LocationData["source"],
): LocationData | null {
  const latitude = asNumber(result?.geometry?.location?.lat);
  const longitude = asNumber(result?.geometry?.location?.lng);
  if (latitude === null || longitude === null) return null;

  return createProviderLocation(latitude, longitude, source);
}

async function maybeGeocodeText(
  envelope: GoogleMapsEnvelope,
  options: GoogleApiEnrichmentOptions,
  policy: EnrichmentPolicy,
): Promise<GoogleMapsEnvelope> {
  if (envelope.location.value !== null) return envelope;

  const shouldRun = shouldRunByPolicy({
    currentHasValue: false,
    policy,
    explicitlyEnabled: options.enableGeocoding,
    defaultWhenNeeded: true,
  });
  if (!shouldRun) return envelope;

  const geocodeCandidate = selectEnvelopeParsedCandidateText({ envelope });
  if (geocodeCandidate === null) return envelope;

  const textToGeocode = geocodeCandidate.text;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", textToGeocode);
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("region", options.region ?? DEFAULT_REGION);
  url.searchParams.set("language", options.language ?? DEFAULT_LANGUAGE);

  try {
    const outcome = await callGoogleProvider<GeocodingResultBody>({
      provider: "geocoding",
      requestUrl: url.toString(),
      fetchFn: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });

    if (outcome.kind === "denied") {
      return {
        ...envelope,
        diagnostics: mergeDiagnostics(envelope.diagnostics, [
          createProviderErrorDiagnostic(outcome.raw),
        ]),
        raw: appendRawArtifacts(envelope.raw, {
          providerErrors: [outcome.raw],
        }),
      };
    }

    const rawPatch = shouldCaptureRaw(envelope, "geocoding")
      ? { geocoding: createProviderRawArtifact(url.toString(), outcome.body) }
      : {};

    if (outcome.kind === "empty") {
      return {
        ...envelope,
        raw: appendRawArtifacts(envelope.raw, rawPatch),
      };
    }

    const firstResult = outcome.body.results?.[0];
    const geocodedLocation = locationFromGeocodingResult(
      firstResult,
      "provider-geocoding",
    );
    const nextLocation =
      geocodedLocation === null
        ? envelope.location
        : createSection(
            "present",
            geocodedLocation,
            [],
            [
              {
                stage: "geocoding",
                source: "google-geocoding-api",
                confidence: "medium",
              },
            ],
          );

    const nextPlace = createSection(
      "present",
      mergePlaceValue(envelope.place.value, {
        title: envelope.place.value?.title ?? textToGeocode,
        formattedAddress:
          firstResult?.formatted_address ??
          envelope.place.value?.formattedAddress ??
          null,
        placeId: firstResult?.place_id ?? envelope.place.value?.placeId ?? null,
        district: addressComponent(firstResult?.address_components, [
          "sublocality_level_1",
          "neighborhood",
          "administrative_area_level_3",
        ]),
        city: addressComponent(firstResult?.address_components, [
          "locality",
          "administrative_area_level_2",
        ]),
        country: addressComponent(firstResult?.address_components, ["country"]),
        types: firstResult?.types ?? envelope.place.value?.types ?? [],
        plusCode:
          plusCodeFromUnknown(firstResult?.plus_code) ??
          envelope.place.value?.plusCode ??
          null,
      }),
      [],
      [
        {
          stage: "geocoding",
          source: "google-geocoding-api",
          confidence: "medium",
        },
      ],
    );

    return {
      ...envelope,
      location: nextLocation,
      place: nextPlace,
      identifiers: {
        ...envelope.identifiers,
        placeId: firstResult?.place_id ?? envelope.identifiers.placeId,
        plusCode:
          plusCodeFromUnknown(firstResult?.plus_code) ?? envelope.identifiers.plusCode,
      },
      raw: appendRawArtifacts(envelope.raw, rawPatch),
    };
  } catch (error) {
    if (
      !(error instanceof NetworkRequestError) &&
      !(error instanceof NetworkTimeoutError)
    ) {
      throw error;
    }

    return {
      ...envelope,
      diagnostics: mergeDiagnostics(envelope.diagnostics, [
        createProviderInfrastructureDiagnostic("geocoding", error),
      ]),
    };
  }
}

async function maybeReverseGeocodeLocation(
  envelope: GoogleMapsEnvelope,
  options: GoogleApiEnrichmentOptions,
  policy: EnrichmentPolicy,
): Promise<GoogleMapsEnvelope> {
  const currentLocation = envelope.location.value;
  if (currentLocation === null) return envelope;

  const placeHasAddress =
    envelope.place.value?.formattedAddress !== null ||
    envelope.place.value?.city !== null ||
    envelope.place.value?.district !== null;

  const shouldRun = shouldRunByPolicy({
    currentHasValue: placeHasAddress,
    policy,
    explicitlyEnabled: options.enableReverseGeocoding,
    defaultWhenNeeded: true,
  });
  if (!shouldRun) return envelope;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set(
    "latlng",
    `${currentLocation.latitude},${currentLocation.longitude}`,
  );
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("region", options.region ?? DEFAULT_REGION);
  url.searchParams.set("language", options.language ?? DEFAULT_LANGUAGE);

  try {
    const outcome = await callGoogleProvider<GeocodingResultBody>({
      provider: "reverse-geocoding",
      requestUrl: url.toString(),
      fetchFn: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });

    if (outcome.kind === "denied") {
      return {
        ...envelope,
        diagnostics: mergeDiagnostics(envelope.diagnostics, [
          createProviderErrorDiagnostic(outcome.raw),
        ]),
        raw: appendRawArtifacts(envelope.raw, {
          providerErrors: [outcome.raw],
        }),
      };
    }

    const rawPatch = shouldCaptureRaw(envelope, "reverse-geocoding")
      ? {
          reverseGeocoding: createProviderRawArtifact(url.toString(), outcome.body),
        }
      : {};

    if (outcome.kind === "empty") {
      return {
        ...envelope,
        raw: appendRawArtifacts(envelope.raw, rawPatch),
      };
    }

    const firstResult = outcome.body.results?.[0];
    const nextPlace = createSection(
      "present",
      mergePlaceValue(envelope.place.value, {
        formattedAddress:
          firstResult?.formatted_address ??
          envelope.place.value?.formattedAddress ??
          null,
        placeId: firstResult?.place_id ?? envelope.place.value?.placeId ?? null,
        district: addressComponent(firstResult?.address_components, [
          "sublocality_level_1",
          "administrative_area_level_3",
          "neighborhood",
        ]),
        city: addressComponent(firstResult?.address_components, [
          "locality",
          "administrative_area_level_2",
        ]),
        country: addressComponent(firstResult?.address_components, ["country"]),
        types: firstResult?.types ?? envelope.place.value?.types ?? [],
        plusCode:
          plusCodeFromUnknown(firstResult?.plus_code) ??
          envelope.place.value?.plusCode ??
          null,
      }),
      [],
      [
        {
          stage: "reverse-geocoding",
          source: "google-geocoding-api",
          confidence: "high",
        },
      ],
    );

    return {
      ...envelope,
      place: nextPlace,
      identifiers: {
        ...envelope.identifiers,
        placeId: firstResult?.place_id ?? envelope.identifiers.placeId,
        plusCode:
          plusCodeFromUnknown(firstResult?.plus_code) ?? envelope.identifiers.plusCode,
      },
      raw: appendRawArtifacts(envelope.raw, rawPatch),
    };
  } catch (error) {
    if (
      !(error instanceof NetworkRequestError) &&
      !(error instanceof NetworkTimeoutError)
    ) {
      throw error;
    }

    return {
      ...envelope,
      diagnostics: mergeDiagnostics(envelope.diagnostics, [
        createProviderInfrastructureDiagnostic("reverse-geocoding", error),
      ]),
    };
  }
}

async function maybeFindPlace(
  envelope: GoogleMapsEnvelope,
  options: GoogleApiEnrichmentOptions,
  policy: EnrichmentPolicy,
): Promise<GoogleMapsEnvelope> {
  const shouldRun = shouldRunByPolicy({
    currentHasValue: envelope.identifiers.placeId !== null,
    policy,
    explicitlyEnabled: options.enablePlaces,
    defaultWhenNeeded: false,
  });
  if (!shouldRun) return envelope;

  const inputText =
    trimToNull(envelope.place.value?.title) ??
    trimToNull(envelope.query.value?.text) ??
    trimToNull(envelope.place.value?.formattedAddress);
  if (inputText === null) return envelope;

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
  );
  url.searchParams.set("input", inputText);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set(
    "fields",
    "place_id,name,formatted_address,types,geometry,plus_code",
  );
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("language", options.language ?? DEFAULT_LANGUAGE);

  try {
    const outcome = await callGoogleProvider<PlacesFindResultBody>({
      provider: "places",
      requestUrl: url.toString(),
      fetchFn: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });

    if (outcome.kind === "denied") {
      return {
        ...envelope,
        diagnostics: mergeDiagnostics(envelope.diagnostics, [
          createProviderErrorDiagnostic(outcome.raw),
        ]),
        raw: appendRawArtifacts(envelope.raw, {
          providerErrors: [outcome.raw],
        }),
      };
    }

    const rawPatch = shouldCaptureRaw(envelope, "places")
      ? { places: createProviderRawArtifact(url.toString(), outcome.body) }
      : {};

    if (outcome.kind === "empty") {
      return {
        ...envelope,
        raw: appendRawArtifacts(envelope.raw, rawPatch),
      };
    }

    const candidate = outcome.body.candidates?.[0];
    const nextLocation = (() => {
      if (envelope.location.value !== null) return envelope.location;

      const latitude = asNumber(candidate?.geometry?.location?.lat);
      const longitude = asNumber(candidate?.geometry?.location?.lng);
      if (latitude === null || longitude === null) return envelope.location;

      return createSection(
        "present",
        createProviderLocation(latitude, longitude, "provider-places"),
        [],
        [
          {
            stage: "places",
            source: "google-places-api",
            confidence: "medium",
          },
        ],
      );
    })();

    const nextPlace = createSection(
      "present",
      mergePlaceValue(envelope.place.value, {
        title: candidate?.name ?? envelope.place.value?.title ?? inputText,
        formattedAddress:
          candidate?.formatted_address ?? envelope.place.value?.formattedAddress ?? null,
        placeId: candidate?.place_id ?? envelope.place.value?.placeId ?? null,
        types: candidate?.types ?? envelope.place.value?.types ?? [],
        plusCode:
          plusCodeFromUnknown(candidate?.plus_code) ??
          envelope.place.value?.plusCode ??
          null,
      }),
      [],
      [
        {
          stage: "places",
          source: "google-places-api",
          confidence: "medium",
        },
      ],
    );

    return {
      ...envelope,
      location: nextLocation,
      place: nextPlace,
      identifiers: {
        ...envelope.identifiers,
        placeId: candidate?.place_id ?? envelope.identifiers.placeId,
        plusCode:
          plusCodeFromUnknown(candidate?.plus_code) ?? envelope.identifiers.plusCode,
      },
      raw: appendRawArtifacts(envelope.raw, rawPatch),
    };
  } catch (error) {
    if (
      !(error instanceof NetworkRequestError) &&
      !(error instanceof NetworkTimeoutError)
    ) {
      throw error;
    }

    return {
      ...envelope,
      diagnostics: mergeDiagnostics(envelope.diagnostics, [
        createProviderInfrastructureDiagnostic("places", error),
      ]),
    };
  }
}

async function maybeDirections(
  envelope: GoogleMapsEnvelope,
  options: GoogleApiEnrichmentOptions,
  policy: EnrichmentPolicy,
): Promise<GoogleMapsEnvelope> {
  const route = envelope.route.value;
  if (route === null) return envelope;
  if (route.originText === null || route.destinationText === null) return envelope;

  const shouldRun = shouldRunByPolicy({
    currentHasValue: route.distanceMeters !== null || route.durationSeconds !== null,
    policy,
    explicitlyEnabled: options.enableDirections,
    defaultWhenNeeded: false,
  });
  if (!shouldRun) return envelope;

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", route.originText);
  url.searchParams.set("destination", route.destinationText);
  if (route.waypoints.length > 0) {
    url.searchParams.set("waypoints", route.waypoints.join("|"));
  }
  const normalizedMode = normalizeTravelMode(route.travelMode);
  if (normalizedMode !== null) {
    url.searchParams.set("mode", normalizedMode);
  }
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("language", options.language ?? DEFAULT_LANGUAGE);

  try {
    const outcome = await callGoogleProvider<DirectionsResultBody>({
      provider: "directions",
      requestUrl: url.toString(),
      fetchFn: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });

    if (outcome.kind === "denied") {
      return {
        ...envelope,
        diagnostics: mergeDiagnostics(envelope.diagnostics, [
          createProviderErrorDiagnostic(outcome.raw),
        ]),
        raw: appendRawArtifacts(envelope.raw, {
          providerErrors: [outcome.raw],
        }),
      };
    }

    const rawPatch = shouldCaptureRaw(envelope, "directions")
      ? { directions: createProviderRawArtifact(url.toString(), outcome.body) }
      : {};

    if (outcome.kind === "empty") {
      return {
        ...envelope,
        raw: appendRawArtifacts(envelope.raw, rawPatch),
      };
    }

    const leg = outcome.body.routes?.[0]?.legs?.[0];
    const nextRoute = createSection(
      "present",
      mergeRouteValue(envelope.route.value, {
        distanceMeters: asNumber(leg?.distance?.value),
        durationSeconds: asNumber(leg?.duration?.value),
        polyline: asString(outcome.body.routes?.[0]?.overview_polyline?.points),
      }),
      [],
      [
        {
          stage: "directions",
          source: "google-directions-api",
          confidence: "medium",
        },
      ],
    );

    return {
      ...envelope,
      route: nextRoute,
      raw: appendRawArtifacts(envelope.raw, rawPatch),
    };
  } catch (error) {
    if (
      !(error instanceof NetworkRequestError) &&
      !(error instanceof NetworkTimeoutError)
    ) {
      throw error;
    }

    return {
      ...envelope,
      diagnostics: mergeDiagnostics(envelope.diagnostics, [
        createProviderInfrastructureDiagnostic("directions", error),
      ]),
    };
  }
}

export async function enrichGoogleMapsEnvelope(
  envelope: GoogleMapsEnvelope,
  options: GoogleApiEnrichmentOptions,
  policy: EnrichmentPolicy = "when-needed",
): Promise<GoogleMapsEnvelope> {
  if (envelope.status === "error") return { ...envelope, mode: "enriched" };

  let enriched: GoogleMapsEnvelope = { ...envelope, mode: "enriched" };
  enriched = await maybeGeocodeText(enriched, options, policy);
  enriched = await maybeReverseGeocodeLocation(enriched, options, policy);
  enriched = await maybeFindPlace(enriched, options, policy);
  enriched = await maybeDirections(enriched, options, policy);
  return enriched;
}
