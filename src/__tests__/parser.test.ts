import { describe, expect, test } from "bun:test";
import {
  canonicalizeGoogleMapsUrl,
  DisallowedHostnameError,
  extractCoordsFromUrl,
  extractFeatureId,
  extractGeocodeText,
  extractQueryText,
  isGoogleMapsUrl,
  parseGoogleMapsUrl,
  parseGoogleMapsUrlOrThrow,
} from "../index";
import { SHORTLINKS, STABLE_COORDINATE_URLS, TEXT_URLS } from "./fixtures";

describe("parseGoogleMapsUrl", () => {
  test("extracts coordinates from direct @ URLs", () => {
    const result = parseGoogleMapsUrl(STABLE_COORDINATE_URLS.atPattern);
    expect(result.status).toBe("ok");
    expect(result.intent).toBe("coordinates");
    expect(result.location.value).toEqual({
      latitude: 24.7136,
      longitude: 46.6753,
      source: "at-pattern",
      accuracy: "exact",
    });
    expect(result.mapView.value?.zoom).toBe(15);
  });

  test("preserves precedence for q= coordinates before data params", () => {
    const result = extractCoordsFromUrl(
      "https://www.google.com/maps?q=10.0,20.0&data=!3d30.0!4d40.0",
    );
    expect(result?.coordinates).toEqual({ latitude: 10, longitude: 20 });
    expect(result?.source).toBe("query-param");
  });

  test("extracts human query text instead of treating it as coordinates", () => {
    const result = parseGoogleMapsUrl(TEXT_URLS.queryText);
    expect(result.intent).toBe("search");
    expect(result.query.value).toEqual({
      text: "Malaz Riyadh",
      source: "q-param",
      isCoordinateQuery: false,
      mapAction: null,
    });
    expect(result.location.value).toBeNull();
  });

  test("extracts decoded place-path text for geocoding fallback", () => {
    expect(extractGeocodeText(TEXT_URLS.placePathText)).toBe("حي الملاز");
    const result = parseGoogleMapsUrl(TEXT_URLS.placePathText);
    expect(result.intent).toBe("place");
    expect(result.place.value?.title).toBe("حي الملاز");
    expect(result.identifiers.featureId).toBe("0x123:0x456");
  });

  test("parses directions URLs into route data", () => {
    const result = parseGoogleMapsUrl(TEXT_URLS.directions);
    expect(result.intent).toBe("directions");
    expect(result.route.value).toEqual({
      originText: "Riyadh",
      destinationText: "Diriyah",
      waypoints: [],
      travelMode: "driving",
      distanceMeters: null,
      durationSeconds: null,
      polyline: null,
    });
  });

  test("parses map_action=pano as streetview intent", () => {
    const result = parseGoogleMapsUrl(TEXT_URLS.pano);
    expect(result.intent).toBe("streetview");
    expect(result.mapView.value?.mapAction).toBe("pano");
    expect(result.mapView.value?.panoId).toBe("test-pano");
    expect(result.location.value?.source).toBe("viewpoint-param");
  });

  test("captures parse artifacts when raw mode is enabled", () => {
    const result = parseGoogleMapsUrl(STABLE_COORDINATE_URLS.queryPattern, {
      raw: { enabled: true },
    });
    expect(result.raw?.parse?.canonicalizedInput).toBe(
      STABLE_COORDINATE_URLS.queryPattern,
    );
    expect(result.raw?.parse?.matchedPattern).toBe("query-param");
    expect(result.raw?.parse?.detectedPatterns).toContain("q-param");
  });

  test("returns a safe error envelope for unsupported share.google URLs", () => {
    const result = parseGoogleMapsUrl(SHORTLINKS.unsupported);
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("unsupported_url");
  });

  test("throws in the throw variant for unsupported URLs", () => {
    expect(() => parseGoogleMapsUrlOrThrow(SHORTLINKS.unsupported)).toThrow(
      "share.google",
    );
  });

  test("rejects suffix-spoofed hosts", () => {
    expect(isGoogleMapsUrl("https://google.com.evil/maps")).toBe(false);
    const result = parseGoogleMapsUrl("https://google.com.evil/maps");
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("disallowed_hostname");
  });

  test("preserves rejected hostname in throw variant typed errors", () => {
    let thrownError: unknown;

    try {
      parseGoogleMapsUrlOrThrow("https://google.com.evil/maps");
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(DisallowedHostnameError);
    expect((thrownError as DisallowedHostnameError).hostname).toBe("google.com.evil");
  });

  test("rejects non-web URL schemes", () => {
    const input = "ftp://maps.google.com/?q=24.7,46.6";

    expect(isGoogleMapsUrl(input)).toBe(false);

    const result = parseGoogleMapsUrl(input);
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("unsupported_url");
  });

  test("canonicalizes shortlinks by stripping g_st", () => {
    expect(canonicalizeGoogleMapsUrl(SHORTLINKS.mapsApp)).toBe(
      "https://maps.app.goo.gl/abc123",
    );
  });

  test("keeps query text extraction deterministic", () => {
    expect(extractQueryText(TEXT_URLS.queryText)).toBe("Malaz Riyadh");
    expect(extractQueryText(STABLE_COORDINATE_URLS.queryPattern)).toBeNull();
  });

  test("extracts feature IDs from ftid query params", () => {
    expect(
      extractFeatureId("https://www.google.com/maps/place/Test?ftid=0xabc:0xdef"),
    ).toBe("0xabc:0xdef");
  });
});
