import { describe, expect, test } from "bun:test";
import {
  analyzeGoogleMapsUrl,
  enrichGoogleMapsEnvelope,
  parseGoogleMapsUrl,
} from "../index";
import {
  DIRECTIONS_OK,
  GEOCODING_OK,
  PROVIDER_DENIED,
  STABLE_COORDINATE_URLS,
  TEXT_URLS,
} from "./fixtures";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("enrichment", () => {
  test("enriched mode without provider config stays safe and loud", async () => {
    const result = await analyzeGoogleMapsUrl(TEXT_URLS.queryText, {
      mode: "enriched",
    });

    expect(result.status).toBe("ok");
    expect(result.mode).toBe("enriched");
    expect(
      result.diagnostics.some((item) => item.code === "enrichment_not_configured"),
    ).toBe(true);
  });

  test("geocodes search text when location is missing", async () => {
    const result = await analyzeGoogleMapsUrl(TEXT_URLS.queryText, {
      mode: "enriched",
      raw: { enabled: true },
      enrich: {
        google: {
          apiKey: "test-key",
          fetch: async () => jsonResponse(GEOCODING_OK),
        },
      },
    });

    expect(result.location.value?.latitude).toBe(24.7136);
    expect(result.location.value?.source).toBe("provider-geocoding");
    expect(result.place.value?.formattedAddress).toBe("Malaz, Riyadh Saudi Arabia");
    expect(result.identifiers.placeId).toBe("place-123");
    expect(result.raw?.geocoding?.providerStatus).toBe("OK");
  });

  test("reverse geocodes an existing coordinate result when address fields are missing", async () => {
    const base = parseGoogleMapsUrl(STABLE_COORDINATE_URLS.atPattern, {
      raw: { enabled: true },
    });

    const result = await enrichGoogleMapsEnvelope(
      { ...base, raw: base.raw ?? {} },
      {
        apiKey: "test-key",
        fetch: async () => jsonResponse(GEOCODING_OK),
        enableGeocoding: false,
        enableReverseGeocoding: true,
      },
    );

    expect(result.place.value?.city).toBe("Riyadh");
    expect(result.place.value?.district).toBe("Malaz");
    expect(result.raw?.reverseGeocoding?.providerStatus).toBe("OK");
  });

  test("captures provider denied responses without crashing", async () => {
    const result = await analyzeGoogleMapsUrl(TEXT_URLS.queryText, {
      mode: "enriched",
      raw: { enabled: true },
      enrich: {
        google: {
          apiKey: "bad-key",
          fetch: async () => jsonResponse(PROVIDER_DENIED),
        },
      },
    });

    expect(result.status).toBe("ok");
    expect(result.raw?.providerErrors?.[0]?.providerStatus).toBe("REQUEST_DENIED");
    expect(result.diagnostics.some((item) => item.code === "geocoding_denied")).toBe(
      true,
    );
  });

  test("fills directions data when directions enrichment is enabled", async () => {
    const result = await analyzeGoogleMapsUrl(TEXT_URLS.directions, {
      mode: "enriched",
      raw: { enabled: true },
      enrich: {
        google: {
          apiKey: "test-key",
          enableGeocoding: false,
          enableReverseGeocoding: false,
          enableDirections: true,
          fetch: async (input) => {
            const requestUrl = typeof input === "string" ? input : String(input);
            if (requestUrl.includes("directions")) {
              return jsonResponse(DIRECTIONS_OK);
            }
            return jsonResponse(GEOCODING_OK);
          },
        },
      },
    });

    expect(result.route.value?.distanceMeters).toBe(12000);
    expect(result.route.value?.durationSeconds).toBe(900);
    expect(result.route.value?.polyline).toBe("encoded-polyline");
    expect(result.raw?.directions?.providerStatus).toBe("OK");
  });
});
