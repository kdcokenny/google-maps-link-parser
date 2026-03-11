import { describe, expect, test } from "bun:test";
import {
  analyzeGoogleMapsUrl,
  enrichGoogleMapsEnvelope,
  parseGoogleMapsUrl,
} from "../index";
import {
  DIRECTIONS_OK,
  GEOCODING_OK,
  PLACES_OK,
  PROVIDER_DENIED,
  SHORTLINKS,
  STABLE_COORDINATE_URLS,
  TEXT_URLS,
} from "./fixtures";

type RedirectStep = {
  readonly status: number;
  readonly location?: string;
  readonly body?: string;
};

function createRedirectFetch(steps: readonly RedirectStep[]) {
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

  test("geocoding text precedence prefers q= over place-path text", async () => {
    let geocodingRequestUrl = "";

    const result = await analyzeGoogleMapsUrl(
      "https://www.google.com/maps/place/NotUsed?q=Preferred+Query",
      {
        mode: "enriched",
        enrich: {
          google: {
            apiKey: "test-key",
            enableReverseGeocoding: false,
            enablePlaces: false,
            enableDirections: false,
            fetch: async (input) => {
              geocodingRequestUrl = typeof input === "string" ? input : String(input);
              return jsonResponse(GEOCODING_OK);
            },
          },
        },
      },
    );

    expect(result.location.value?.source).toBe("provider-geocoding");
    expect(new URL(geocodingRequestUrl).searchParams.get("address")).toBe(
      "Preferred Query",
    );
  });

  test("geocodes decoded /maps/place text when q= is missing", async () => {
    let geocodingRequestUrl = "";

    const result = await analyzeGoogleMapsUrl(TEXT_URLS.placePathText, {
      mode: "enriched",
      enrich: {
        google: {
          apiKey: "test-key",
          enableReverseGeocoding: false,
          enablePlaces: false,
          enableDirections: false,
          fetch: async (input) => {
            geocodingRequestUrl = typeof input === "string" ? input : String(input);
            return jsonResponse(GEOCODING_OK);
          },
        },
      },
    });

    expect(result.location.value?.source).toBe("provider-geocoding");
    expect(new URL(geocodingRequestUrl).searchParams.get("address")).toBe("حي الملاز");
  });

  test("geocodes resolved shortlink text when unfurled URL still lacks coordinates", async () => {
    let geocodingRequestUrl = "";
    let geocodingProviderCallCount = 0;

    const redirectMock = createRedirectFetch([
      { status: 302, location: TEXT_URLS.placePathText },
      { status: 200 },
      { status: 200, body: "<html><body>No direct coords</body></html>" },
    ]);

    const result = await analyzeGoogleMapsUrl(SHORTLINKS.mapsApp, {
      mode: "enriched",
      fetch: redirectMock.fetch,
      enrich: {
        google: {
          apiKey: "test-key",
          enableReverseGeocoding: false,
          enablePlaces: false,
          enableDirections: false,
          fetch: async (input) => {
            geocodingProviderCallCount += 1;
            geocodingRequestUrl = typeof input === "string" ? input : String(input);
            return jsonResponse(GEOCODING_OK);
          },
        },
      },
    });

    expect(result.resolution.resolvedUrl).toBe(TEXT_URLS.placePathText);
    expect(result.location.value?.source).toBe("provider-geocoding");
    expect(geocodingProviderCallCount).toBe(1);
    expect(new URL(geocodingRequestUrl).searchParams.get("address")).toBe("حي الملاز");
  });

  test("skips geocoding provider calls for FTID-only resolved non-text URLs", async () => {
    let geocodingProviderCallCount = 0;

    const ftidOnlyResolvedUrl =
      "https://www.google.com/maps/place/0x123:0x456?ftid=0x123:0x456";
    const redirectMock = createRedirectFetch([
      { status: 302, location: ftidOnlyResolvedUrl },
      { status: 200 },
      { status: 200, body: "<html><body>No direct coords</body></html>" },
    ]);

    const result = await analyzeGoogleMapsUrl(SHORTLINKS.mapsApp, {
      mode: "enriched",
      fetch: redirectMock.fetch,
      enrich: {
        google: {
          apiKey: "test-key",
          enableReverseGeocoding: false,
          enablePlaces: false,
          enableDirections: false,
          fetch: async () => {
            geocodingProviderCallCount += 1;
            return jsonResponse(GEOCODING_OK);
          },
        },
      },
    });

    expect(result.resolution.resolvedUrl).toBe(ftidOnlyResolvedUrl);
    expect(result.location.value).toBeNull();
    expect(geocodingProviderCallCount).toBe(0);
  });

  test("skips geocoding fallback when direct coordinates already exist", async () => {
    let providerCallCount = 0;

    const result = await analyzeGoogleMapsUrl(STABLE_COORDINATE_URLS.atPattern, {
      mode: "enriched",
      enrich: {
        google: {
          apiKey: "test-key",
          enableReverseGeocoding: false,
          enablePlaces: false,
          enableDirections: false,
          fetch: async () => {
            providerCallCount += 1;
            return jsonResponse(GEOCODING_OK);
          },
        },
      },
    });

    expect(result.location.value?.source).toBe("at-pattern");
    expect(providerCallCount).toBe(0);
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

  test("fills place data when places enrichment is enabled", async () => {
    let providerCallCount = 0;

    const result = await analyzeGoogleMapsUrl(TEXT_URLS.queryText, {
      mode: "enriched",
      raw: { enabled: true },
      enrich: {
        google: {
          apiKey: "test-key",
          enableGeocoding: false,
          enableReverseGeocoding: false,
          enablePlaces: true,
          enableDirections: false,
          fetch: async (input) => {
            const requestUrl = typeof input === "string" ? input : String(input);
            providerCallCount += 1;

            if (!requestUrl.includes("findplacefromtext")) {
              throw new Error(`Unexpected provider endpoint: ${requestUrl}`);
            }

            return jsonResponse(PLACES_OK);
          },
        },
      },
    });

    expect(providerCallCount).toBe(1);
    expect(result.location.value?.source).toBe("provider-places");
    expect(result.place.value?.title).toBe("Malaz Plaza");
    expect(result.place.value?.placeId).toBe("places-123");
    expect(result.raw?.places?.providerStatus).toBe("OK");
  });

  test("captures places denied responses without crashing", async () => {
    let providerCallCount = 0;

    const result = await analyzeGoogleMapsUrl(TEXT_URLS.queryText, {
      mode: "enriched",
      raw: { enabled: true },
      enrich: {
        google: {
          apiKey: "bad-key",
          enableGeocoding: false,
          enableReverseGeocoding: false,
          enablePlaces: true,
          enableDirections: false,
          fetch: async (input) => {
            const requestUrl = typeof input === "string" ? input : String(input);
            providerCallCount += 1;

            if (!requestUrl.includes("findplacefromtext")) {
              throw new Error(`Unexpected provider endpoint: ${requestUrl}`);
            }

            return jsonResponse(PROVIDER_DENIED);
          },
        },
      },
    });

    expect(result.status).toBe("ok");
    expect(providerCallCount).toBe(1);
    expect(result.raw?.providerErrors?.[0]?.provider).toBe("places");
    expect(result.raw?.providerErrors?.[0]?.providerStatus).toBe("REQUEST_DENIED");
    expect(result.diagnostics.some((item) => item.code === "places_denied")).toBe(true);
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
