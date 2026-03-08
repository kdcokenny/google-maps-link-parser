import { isAllowedGoogleMapsDomain } from "./domain";
import { parseFiniteNumber } from "./guards";
import { extractCoordsFromUrl } from "./parser";
import type {
  CoordinateSource,
  Coordinates,
  HtmlArtifactsRaw,
  HtmlObservationRaw,
  LocationData,
} from "./types";

interface CoordinateMatch {
  readonly coordinates: Coordinates;
  readonly source: CoordinateSource;
}

export interface HtmlExtractionResult {
  readonly location: LocationData | null;
  readonly candidateUrls: readonly string[];
  readonly geocodeCandidateUrl: string | null;
  readonly artifacts: HtmlArtifactsRaw;
}

const EMBEDDED_GOOGLE_MAPS_URL_PATTERN =
  /https:\/\/(?:(?:www\.)?google\.[a-z.]+\/maps[^"'<>\s]*|maps\.google\.[a-z.]+\/[^"'<>\s]*|goo\.gl\/maps\/[^"'<>\s]*|maps\.app\.goo\.gl\/[^"'<>\s]*)/gi;

const JSON_LD_LATITUDE_PATTERN = /"latitude"\s*:\s*(-?\d+(?:\.\d+)?)/;
const JSON_LD_LONGITUDE_PATTERN = /"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/;
const GEO_INTENT_PATTERN = /geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const DATA_PARAM_PATTERN = /!3d(-?\d+(?:\.\d+)?).*!4d(-?\d+(?:\.\d+)?)/;
const APP_STATE_PATTERN = /\[null,null,(-?\d+\.\d{3,}),(-?\d+\.\d{3,})\]/;
const CENTER_PATTERN = /center['":;\s]*\[?\s*(-?\d+\.\d{3,})\s*[,\]]\s*(-?\d+\.\d{3,})/;
const META_LATITUDE_PATTERN =
  /(?:latitude|place:location:latitude)['"]\s*(?:content|value)=['"]\s*(-?\d+(?:\.\d+)?)/i;
const META_LONGITUDE_PATTERN =
  /(?:longitude|place:location:longitude)['"]\s*(?:content|value)=['"]\s*(-?\d+(?:\.\d+)?)/i;

function isValidCoordinate(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}

function toCoordinateMatch(
  latitude: number,
  longitude: number,
  source: CoordinateSource,
): CoordinateMatch | null {
  if (!isValidCoordinate(latitude, longitude)) return null;

  return {
    coordinates: { latitude, longitude },
    source,
  };
}

function fromMatch(
  match: RegExpMatchArray | null,
  source: CoordinateSource,
): CoordinateMatch | null {
  const latitude = parseFiniteNumber(match?.[1]);
  const longitude = parseFiniteNumber(match?.[2]);
  if (latitude === null || longitude === null) return null;

  return toCoordinateMatch(latitude, longitude, source);
}

function createLocationData(match: CoordinateMatch): LocationData {
  return {
    latitude: match.coordinates.latitude,
    longitude: match.coordinates.longitude,
    source: match.source,
    accuracy: match.source === "html-app-initialization-state" ? "approximate" : "exact",
  };
}

function normalizeHtmlUrl(rawValue: string): string | null {
  const decodedValue = rawValue.replaceAll("&amp;", "&").trim();
  if (decodedValue === "") return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(decodedValue);
  } catch {
    return null;
  }

  if (!isAllowedGoogleMapsDomain(parsedUrl.hostname)) return null;
  return parsedUrl.toString();
}

export function extractEmbeddedGoogleMapsUrls(html: string): readonly string[] {
  const matches = html.match(EMBEDDED_GOOGLE_MAPS_URL_PATTERN) ?? [];
  const normalizedUrls: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const normalizedUrl = normalizeHtmlUrl(match);
    if (normalizedUrl === null) continue;
    if (seen.has(normalizedUrl)) continue;

    seen.add(normalizedUrl);
    normalizedUrls.push(normalizedUrl);
  }

  return normalizedUrls;
}

export function extractDesktopHandoffUrl(html: string): string | null {
  const match = html.match(/data-desktop-link=(?:"([^"]+)"|'([^']+)')/i);
  const rawValue = (match?.[1] ?? match?.[2] ?? "").trim();
  if (rawValue === "") return null;

  return normalizeHtmlUrl(rawValue);
}

function extractMetaRefreshUrl(html: string): string | null {
  const match = html.match(
    /http-equiv=(?:"|')refresh(?:"|')[^>]*content=(?:"|')[^"']*url=([^"']+)(?:"|')/i,
  );
  const rawValue = (match?.[1] ?? "").trim();
  if (rawValue === "") return null;

  return normalizeHtmlUrl(rawValue);
}

function extractJsonLdCoords(html: string): CoordinateMatch | null {
  const latitude = parseFiniteNumber(html.match(JSON_LD_LATITUDE_PATTERN)?.[1]);
  const longitude = parseFiniteNumber(html.match(JSON_LD_LONGITUDE_PATTERN)?.[1]);
  if (latitude === null || longitude === null) return null;

  return toCoordinateMatch(latitude, longitude, "html-json-ld");
}

function extractGeoIntentCoords(html: string): CoordinateMatch | null {
  return fromMatch(html.match(GEO_INTENT_PATTERN), "html-geo-intent");
}

function extractDataParamCoords(html: string): CoordinateMatch | null {
  return fromMatch(html.match(DATA_PARAM_PATTERN), "html-data-param");
}

function extractMetaTagCoords(html: string): CoordinateMatch | null {
  const latitude = parseFiniteNumber(html.match(META_LATITUDE_PATTERN)?.[1]);
  const longitude = parseFiniteNumber(html.match(META_LONGITUDE_PATTERN)?.[1]);
  if (latitude === null || longitude === null) return null;

  return toCoordinateMatch(latitude, longitude, "html-center-pattern");
}

function extractAppStateCoords(html: string): CoordinateMatch | null {
  return fromMatch(html.match(APP_STATE_PATTERN), "html-app-state");
}

function extractCenterCoords(html: string): CoordinateMatch | null {
  return fromMatch(html.match(CENTER_PATTERN), "html-center-pattern");
}

function extractAppInitializationStateCoords(html: string): CoordinateMatch | null {
  const markerIndex = html.indexOf("APP_INITIALIZATION_STATE");
  if (markerIndex === -1) return null;

  const markerWindow = html.slice(markerIndex, markerIndex + 1500);
  const pairMatch = markerWindow.match(/(-?\d+\.\d{3,})\s*,\s*(-?\d+\.\d{3,})/);
  return fromMatch(pairMatch, "html-app-initialization-state");
}

export function extractCoordsFromHtml(html: string): CoordinateMatch | null {
  return (
    extractJsonLdCoords(html) ??
    extractGeoIntentCoords(html) ??
    extractDataParamCoords(html) ??
    extractMetaTagCoords(html) ??
    extractAppStateCoords(html) ??
    extractCenterCoords(html) ??
    extractAppInitializationStateCoords(html)
  );
}

function buildHtmlObservations(
  html: string,
  candidateUrls: readonly string[],
): readonly HtmlObservationRaw[] {
  const observations: HtmlObservationRaw[] = [];

  if (candidateUrls.length > 0) {
    observations.push({
      kind: "embedded-google-maps-urls",
      value: String(candidateUrls.length),
    });
  }

  if (html.includes("APP_INITIALIZATION_STATE")) {
    observations.push({
      kind: "app-initialization-state-present",
      value: "true",
    });
  }

  if (/data-desktop-link=/i.test(html)) {
    observations.push({
      kind: "desktop-handoff-present",
      value: "true",
    });
  }

  if (/http-equiv=(?:"|')refresh(?:"|')/i.test(html)) {
    observations.push({
      kind: "meta-refresh-present",
      value: "true",
    });
  }

  return observations;
}

export function extractHtmlSignals(html: string): HtmlExtractionResult {
  const embeddedUrls = extractEmbeddedGoogleMapsUrls(html);
  const desktopHandoffUrl = extractDesktopHandoffUrl(html);
  const metaRefreshUrl = extractMetaRefreshUrl(html);

  const orderedCandidates: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [desktopHandoffUrl, metaRefreshUrl, ...embeddedUrls]) {
    if (candidate === null) continue;
    if (seen.has(candidate)) continue;

    seen.add(candidate);
    orderedCandidates.push(candidate);
  }

  for (const candidate of orderedCandidates) {
    const urlMatch = extractCoordsFromUrl(candidate);
    if (urlMatch === null) continue;

    return {
      location: createLocationData(urlMatch),
      candidateUrls: orderedCandidates,
      geocodeCandidateUrl: candidate,
      artifacts: {
        extractedUrls: orderedCandidates,
        observations: buildHtmlObservations(html, orderedCandidates),
      },
    };
  }

  const htmlMatch = extractCoordsFromHtml(html);
  if (htmlMatch !== null) {
    return {
      location: createLocationData(htmlMatch),
      candidateUrls: orderedCandidates,
      geocodeCandidateUrl: orderedCandidates[0] ?? null,
      artifacts: {
        extractedUrls: orderedCandidates,
        observations: buildHtmlObservations(html, orderedCandidates),
      },
    };
  }

  return {
    location: null,
    candidateUrls: orderedCandidates,
    geocodeCandidateUrl: orderedCandidates[0] ?? null,
    artifacts: {
      extractedUrls: orderedCandidates,
      observations: buildHtmlObservations(html, orderedCandidates),
    },
  };
}
