import {
  canonicalizeGoogleMapsUrl,
  classifyHostname,
  isGoogleMapsUrl,
  isShortLinkDomain,
} from "./domain";
import {
  DisallowedHostnameError,
  EmptyInputError,
  InvalidGoogleMapsUrlError,
  UnsupportedGoogleMapsUrlError,
} from "./errors";
import { parseFiniteNumber, safeDecodeURIComponent, trimToNull } from "./guards";
import {
  absentSection,
  createEnvelope,
  createErrorSummary,
  createInputMetadata,
  createResolutionMetadata,
  createSection,
  withRawParseArtifacts,
} from "./normalize";
import type {
  CoordinateSource,
  Coordinates,
  GoogleMapsEnvelope,
  GoogleMapsIntent,
  LocationData,
  MapAction,
  MapViewData,
  ParseArtifactsRaw,
  ParseOptions,
  PlaceData,
  PlusCode,
  QueryData,
  QueryTextSource,
  RouteData,
  TravelMode,
} from "./types";

interface CoordinateMatch {
  readonly coordinates: Coordinates;
  readonly source: CoordinateSource;
}

const AT_PATTERN = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?z?/;
const DATA_PATTERN = /!3d(-?\d+(?:\.\d+)?).*!4d(-?\d+(?:\.\d+)?)/;
const PLACE_COORDS_PATTERN = /\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const FTID_PATTERN = /0x[0-9a-fA-F]+:0x[0-9a-fA-F]+/;
const NUMERIC_COORDS_PATTERN = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;
const PLUS_CODE_PATTERN = /([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})/i;

function safeParseUrl(rawValue: string): URL | null {
  try {
    return new URL(rawValue);
  } catch {
    return null;
  }
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}

function fromMatch(
  match: RegExpMatchArray | null,
  source: CoordinateSource,
): CoordinateMatch | null {
  if (match?.[1] === undefined || match[2] === undefined) return null;

  const latitude = Number.parseFloat(match[1]);
  const longitude = Number.parseFloat(match[2]);
  if (!isValidCoordinate(latitude, longitude)) return null;

  return {
    coordinates: { latitude, longitude },
    source,
  };
}

function coordsFromParamValue(
  value: string | null,
  source: CoordinateSource,
): CoordinateMatch | null {
  if (value === null) return null;

  const match = value.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  return fromMatch(match, source);
}

function createLocationData(match: CoordinateMatch): LocationData {
  return {
    latitude: match.coordinates.latitude,
    longitude: match.coordinates.longitude,
    source: match.source,
    accuracy: "exact",
  };
}

function decodeHumanText(rawValue: string): string | null {
  const decoded = safeDecodeURIComponent(rawValue);
  if (decoded === null) return null;

  const normalized = decoded.replace(/\+/g, " ").trim();
  if (normalized === "") return null;

  return normalized;
}

function extractPlacePathText(parsedUrl: URL): string | null {
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const placeIndex = segments.findIndex((segment) => segment.toLowerCase() === "place");
  if (placeIndex === -1) return null;

  const rawSegment = segments[placeIndex + 1];
  if (rawSegment === undefined) return null;
  if (rawSegment.toLowerCase().startsWith("data=!")) return null;

  const decoded = decodeHumanText(rawSegment);
  if (decoded === null) return null;
  if (NUMERIC_COORDS_PATTERN.test(decoded)) return null;

  return decoded;
}

function extractSearchTextFromParam(
  parsedUrl: URL,
  paramName: "q" | "query",
  source: QueryTextSource,
): QueryData | null {
  const rawValue = trimToNull(parsedUrl.searchParams.get(paramName));
  if (rawValue === null) return null;

  const isCoordinateQuery = NUMERIC_COORDS_PATTERN.test(rawValue);
  return {
    text: isCoordinateQuery ? null : rawValue,
    source,
    isCoordinateQuery,
    mapAction: extractMapAction(parsedUrl),
  };
}

function extractTravelMode(parsedUrl: URL): TravelMode | null {
  const rawMode = trimToNull(parsedUrl.searchParams.get("travelmode"));
  if (rawMode === null) return null;

  switch (rawMode.toLowerCase()) {
    case "driving":
    case "walking":
    case "bicycling":
    case "transit":
      return rawMode.toLowerCase() as TravelMode;
    case "two-wheeler":
    case "two_wheeler":
    case "twowheeler":
      return "two-wheeler";
    default:
      return null;
  }
}

function extractDirectionsFromPath(parsedUrl: URL): {
  originText: string | null;
  destinationText: string | null;
} {
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const dirIndex = segments.findIndex((segment) => segment.toLowerCase() === "dir");
  if (dirIndex === -1) {
    return { originText: null, destinationText: null };
  }

  const rawSegments = segments.slice(dirIndex + 1).filter((segment) => {
    const lowered = segment.toLowerCase();
    return (
      lowered !== "maps" &&
      !lowered.startsWith("@") &&
      !lowered.startsWith("data=!") &&
      lowered !== ""
    );
  });

  const decodedSegments = rawSegments
    .map((segment) => decodeHumanText(segment))
    .filter((segment): segment is string => segment !== null);

  return {
    originText: decodedSegments[0] ?? null,
    destinationText: decodedSegments[1] ?? null,
  };
}

function extractRouteData(parsedUrl: URL): RouteData | null {
  const pathRoute = extractDirectionsFromPath(parsedUrl);
  const originText =
    trimToNull(parsedUrl.searchParams.get("origin")) ?? pathRoute.originText;
  const destinationText =
    trimToNull(parsedUrl.searchParams.get("destination")) ?? pathRoute.destinationText;

  const rawWaypoints = trimToNull(parsedUrl.searchParams.get("waypoints"));
  const waypoints =
    rawWaypoints === null
      ? []
      : rawWaypoints
          .split("|")
          .map((waypoint) => waypoint.trim())
          .filter((waypoint) => waypoint !== "");

  const travelMode = extractTravelMode(parsedUrl);
  if (
    originText === null &&
    destinationText === null &&
    waypoints.length === 0 &&
    travelMode === null
  ) {
    return null;
  }

  return {
    originText,
    destinationText,
    waypoints,
    travelMode,
    distanceMeters: null,
    durationSeconds: null,
    polyline: null,
  };
}

function extractMapAction(parsedUrl: URL): MapAction | null {
  const rawAction = trimToNull(parsedUrl.searchParams.get("map_action"));
  if (rawAction === null) return null;

  switch (rawAction.toLowerCase()) {
    case "map":
      return "map";
    case "pano":
      return "pano";
    default:
      return null;
  }
}

function extractZoom(rawUrl: string, parsedUrl: URL): number | null {
  const atMatch = rawUrl.match(AT_PATTERN);
  const zoomFromAt = parseFiniteNumber(atMatch?.[3]);
  if (zoomFromAt !== null) return zoomFromAt;

  return parseFiniteNumber(parsedUrl.searchParams.get("z"));
}

function extractHeading(parsedUrl: URL): number | null {
  return parseFiniteNumber(parsedUrl.searchParams.get("heading"));
}

function extractPitch(parsedUrl: URL): number | null {
  return parseFiniteNumber(parsedUrl.searchParams.get("pitch"));
}

function extractPanoId(parsedUrl: URL): string | null {
  return trimToNull(parsedUrl.searchParams.get("pano"));
}

function detectIntent(args: {
  location: LocationData | null;
  placeTitle: string | null;
  featureId: string | null;
  query: QueryData | null;
  route: RouteData | null;
  mapView: MapViewData | null;
}): GoogleMapsIntent {
  if (
    args.mapView?.mapAction === "pano" ||
    (args.mapView !== null && args.mapView.panoId !== null)
  ) {
    return "streetview";
  }

  if (args.route !== null) {
    return "directions";
  }

  if (args.query !== null && args.query.text !== null) {
    return "search";
  }

  if (args.placeTitle !== null || args.featureId !== null) {
    return "place";
  }

  if (args.mapView?.mapAction === "map") {
    return "map";
  }

  if (args.location !== null) {
    return "coordinates";
  }

  return "unknown";
}

function inferPlusCode(text: string | null): PlusCode | null {
  if (text === null) return null;

  const match = text.match(PLUS_CODE_PATTERN);
  if (match?.[1] === undefined) return null;

  return {
    globalCode: match[1].toUpperCase(),
    compoundCode: null,
  };
}

function detectPatterns(rawUrl: string, parsedUrl: URL): readonly string[] {
  const patterns: string[] = [];

  if (AT_PATTERN.test(rawUrl)) patterns.push("at-pattern");
  if (coordsFromParamValue(parsedUrl.searchParams.get("q"), "query-param")) {
    patterns.push("q-param");
  }
  if (coordsFromParamValue(parsedUrl.searchParams.get("query"), "query-param")) {
    patterns.push("query-param");
  }
  if (DATA_PATTERN.test(rawUrl)) patterns.push("data-param");
  if (PLACE_COORDS_PATTERN.test(rawUrl)) patterns.push("place-path");
  if (coordsFromParamValue(parsedUrl.searchParams.get("ll"), "ll-param")) {
    patterns.push("ll-param");
  }
  if (coordsFromParamValue(parsedUrl.searchParams.get("sll"), "ll-param")) {
    patterns.push("sll-param");
  }
  if (
    coordsFromParamValue(parsedUrl.searchParams.get("destination"), "destination-param")
  ) {
    patterns.push("destination-param");
  }
  if (coordsFromParamValue(parsedUrl.searchParams.get("viewpoint"), "viewpoint-param")) {
    patterns.push("viewpoint-param");
  }

  return patterns;
}

export function extractCoordsFromUrl(rawUrl: string): CoordinateMatch | null {
  const atResult = fromMatch(rawUrl.match(AT_PATTERN), "at-pattern");
  if (atResult !== null) return atResult;

  const parsedUrl = safeParseUrl(rawUrl);
  if (parsedUrl !== null) {
    const qResult = coordsFromParamValue(parsedUrl.searchParams.get("q"), "query-param");
    if (qResult !== null) return qResult;

    const queryResult = coordsFromParamValue(
      parsedUrl.searchParams.get("query"),
      "query-param",
    );
    if (queryResult !== null) return queryResult;
  }

  const dataResult = fromMatch(rawUrl.match(DATA_PATTERN), "data-param");
  if (dataResult !== null) return dataResult;

  const placeResult = fromMatch(rawUrl.match(PLACE_COORDS_PATTERN), "place-path");
  if (placeResult !== null) return placeResult;

  if (parsedUrl !== null) {
    const llResult =
      coordsFromParamValue(parsedUrl.searchParams.get("ll"), "ll-param") ??
      coordsFromParamValue(parsedUrl.searchParams.get("sll"), "ll-param");
    if (llResult !== null) return llResult;

    const destinationResult = coordsFromParamValue(
      parsedUrl.searchParams.get("destination"),
      "destination-param",
    );
    if (destinationResult !== null) return destinationResult;

    const viewpointResult = coordsFromParamValue(
      parsedUrl.searchParams.get("viewpoint"),
      "viewpoint-param",
    );
    if (viewpointResult !== null) return viewpointResult;
  }

  return null;
}

export function extractFeatureId(rawUrl: string): string | null {
  const parsedUrl = safeParseUrl(rawUrl);
  if (parsedUrl === null) return null;

  const queryFeatureId = trimToNull(parsedUrl.searchParams.get("ftid"));
  if (queryFeatureId !== null && FTID_PATTERN.test(queryFeatureId)) {
    return queryFeatureId;
  }

  const pathMatch = rawUrl.match(FTID_PATTERN);
  return pathMatch?.[0] ?? null;
}

export function extractQueryText(rawUrl: string): string | null {
  const parsedUrl = safeParseUrl(rawUrl);
  if (parsedUrl === null) return null;

  const qResult = extractSearchTextFromParam(parsedUrl, "q", "q-param");
  if (qResult !== null && qResult.text !== null) return qResult.text;

  const queryResult = extractSearchTextFromParam(parsedUrl, "query", "query-param");
  if (queryResult !== null && queryResult.text !== null) return queryResult.text;

  return null;
}

export function extractGeocodeText(rawUrl: string): string | null {
  const queryText = extractQueryText(rawUrl);
  if (queryText !== null) return queryText;

  const parsedUrl = safeParseUrl(rawUrl);
  if (parsedUrl === null) return null;

  return extractPlacePathText(parsedUrl);
}

function toErrorEnvelope(
  rawInput: string,
  error:
    | EmptyInputError
    | InvalidGoogleMapsUrlError
    | DisallowedHostnameError
    | UnsupportedGoogleMapsUrlError,
): GoogleMapsEnvelope {
  return createEnvelope({
    mode: "minimal",
    intent: "unknown",
    input: createInputMetadata({
      raw: rawInput,
      normalized: rawInput,
      hostname: null,
      hostKind: "unknown",
      isGoogleMapsUrl: false,
      isShortLink: false,
      canonicalized: null,
    }),
    resolution: createResolutionMetadata({ status: "not-attempted" }),
    error: createErrorSummary(error.code, error.message, error.details),
  });
}

export function parseGoogleMapsUrl(
  rawInput: string,
  options: ParseOptions = {},
): GoogleMapsEnvelope {
  const trimmedInput = trimToNull(rawInput);
  if (trimmedInput === null) {
    return toErrorEnvelope("", new EmptyInputError());
  }

  const parsedUrl = safeParseUrl(trimmedInput);
  if (parsedUrl === null) {
    return toErrorEnvelope(
      trimmedInput,
      new InvalidGoogleMapsUrlError("Input is not a valid URL.", {
        details: trimmedInput,
      }),
    );
  }

  const hostKind = classifyHostname(parsedUrl.hostname);
  if (hostKind === "disallowed") {
    return toErrorEnvelope(trimmedInput, new DisallowedHostnameError(parsedUrl.hostname));
  }

  if (hostKind === "unsupported-shortlink") {
    return toErrorEnvelope(
      trimmedInput,
      new UnsupportedGoogleMapsUrlError(
        "share.google links are recognized but unsupported for public resolution.",
        { details: parsedUrl.hostname },
      ),
    );
  }

  if (!isGoogleMapsUrl(trimmedInput)) {
    return toErrorEnvelope(
      trimmedInput,
      new UnsupportedGoogleMapsUrlError(
        "URL is not a supported public Google Maps link.",
        { details: trimmedInput },
      ),
    );
  }

  const canonicalizedInput = canonicalizeGoogleMapsUrl(trimmedInput);
  const workingUrl = canonicalizedInput;
  const workingParsedUrl = new URL(workingUrl);
  const coordinateMatch = extractCoordsFromUrl(workingUrl);
  const location =
    coordinateMatch === null
      ? absentSection<LocationData>()
      : createSection(
          "present",
          createLocationData(coordinateMatch),
          [],
          [
            {
              stage: "parse",
              source: coordinateMatch.source,
              confidence: "high",
              url: workingUrl,
            },
          ],
        );

  const placeTitle = extractPlacePathText(workingParsedUrl);
  const featureId = extractFeatureId(workingUrl);
  const searchQuery =
    extractSearchTextFromParam(workingParsedUrl, "q", "q-param") ??
    extractSearchTextFromParam(workingParsedUrl, "query", "query-param");
  const querySection =
    searchQuery === null && extractMapAction(workingParsedUrl) === null
      ? absentSection<QueryData>()
      : createSection(
          "present",
          searchQuery ?? {
            text: null,
            source: null,
            isCoordinateQuery: false,
            mapAction: extractMapAction(workingParsedUrl),
          },
          [],
          [
            {
              stage: "parse",
              source: searchQuery?.source ?? "map-action",
              confidence: "medium",
              url: workingUrl,
            },
          ],
        );

  const routeValue = extractRouteData(workingParsedUrl);
  const routeSection =
    routeValue === null
      ? absentSection<RouteData>()
      : createSection(
          "present",
          routeValue,
          [],
          [
            {
              stage: "parse",
              source: "directions-url",
              confidence: "medium",
              url: workingUrl,
            },
          ],
        );

  const mapViewValue: MapViewData | null = (() => {
    const center = coordinateMatch === null ? null : createLocationData(coordinateMatch);
    const zoom = extractZoom(workingUrl, workingParsedUrl);
    const heading = extractHeading(workingParsedUrl);
    const pitch = extractPitch(workingParsedUrl);
    const panoId = extractPanoId(workingParsedUrl);
    const mapAction = extractMapAction(workingParsedUrl);

    if (
      center === null &&
      zoom === null &&
      heading === null &&
      pitch === null &&
      panoId === null &&
      mapAction === null
    ) {
      return null;
    }

    return {
      center,
      zoom,
      heading,
      pitch,
      panoId,
      mapAction,
    };
  })();

  const mapViewSection =
    mapViewValue === null
      ? absentSection<MapViewData>()
      : createSection(
          "present",
          mapViewValue,
          [],
          [
            {
              stage: "parse",
              source: "map-view",
              confidence: mapViewValue.mapAction === "pano" ? "medium" : "high",
              url: workingUrl,
            },
          ],
        );

  const placeValue: PlaceData | null =
    placeTitle === null && featureId === null
      ? null
      : {
          title: placeTitle,
          formattedAddress: null,
          featureId,
          placeId: null,
          district: null,
          city: null,
          country: null,
          types: [],
          plusCode: inferPlusCode(placeTitle),
        };

  const placeSection =
    placeValue === null
      ? absentSection<PlaceData>()
      : createSection(
          "present",
          placeValue,
          [],
          [
            {
              stage: "parse",
              source: placeTitle === null ? "feature-id" : "place-path",
              confidence: featureId === null ? "medium" : "high",
              url: workingUrl,
            },
          ],
        );

  const intent = detectIntent({
    location: location.value,
    placeTitle,
    featureId,
    query: querySection.value,
    route: routeSection.value,
    mapView: mapViewSection.value,
  });

  const parseArtifacts: ParseArtifactsRaw | undefined =
    options.raw?.enabled === true
      ? {
          canonicalizedInput: workingUrl,
          matchedPattern: coordinateMatch?.source ?? null,
          detectedPatterns: detectPatterns(workingUrl, workingParsedUrl),
        }
      : undefined;

  const envelope = createEnvelope({
    mode: "minimal",
    intent,
    input: createInputMetadata({
      raw: trimmedInput,
      normalized: workingUrl,
      hostname: workingParsedUrl.hostname,
      hostKind,
      isGoogleMapsUrl: true,
      isShortLink: isShortLinkDomain(workingParsedUrl.hostname),
      canonicalized: canonicalizedInput === trimmedInput ? null : canonicalizedInput,
    }),
    resolution: createResolutionMetadata({
      status: isShortLinkDomain(workingParsedUrl.hostname)
        ? "not-attempted"
        : "not-needed",
    }),
    identifiers: {
      featureId,
      plusCode: inferPlusCode(searchQuery?.text ?? placeTitle),
    },
    location,
    place: placeSection,
    route: routeSection,
    query: querySection,
    mapView: mapViewSection,
  });

  return withRawParseArtifacts(envelope, parseArtifacts);
}

function errorFromEnvelope(
  error: GoogleMapsEnvelope["error"],
):
  | EmptyInputError
  | InvalidGoogleMapsUrlError
  | DisallowedHostnameError
  | UnsupportedGoogleMapsUrlError {
  if (error === null) {
    return new UnsupportedGoogleMapsUrlError("Unknown Google Maps parse failure.");
  }

  switch (error.code) {
    case "empty_input":
      return new EmptyInputError();
    case "invalid_url":
      return new InvalidGoogleMapsUrlError(error.message);
    case "disallowed_hostname":
      return new DisallowedHostnameError(error.details ?? error.message);
    case "unsupported_url":
      return new UnsupportedGoogleMapsUrlError(error.message);
    default:
      return new UnsupportedGoogleMapsUrlError(error.message);
  }
}

export function parseGoogleMapsUrlOrThrow(
  rawInput: string,
  options: ParseOptions = {},
): GoogleMapsEnvelope {
  const result = parseGoogleMapsUrl(rawInput, options);
  if (result.status === "error") {
    throw errorFromEnvelope(result.error);
  }

  return result;
}
