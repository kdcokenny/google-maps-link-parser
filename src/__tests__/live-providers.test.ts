/**
 * Live provider-backed integration tests.
 *
 * Opt-in only:
 *   LIVE_GOOGLE_API_TESTS=1 GOOGLE_MAPS_API_KEY=... bun test src/__tests__/live-providers.test.ts
 *   bun run test:live:providers
 */
import { describe, expect, test } from "bun:test";
import { analyzeGoogleMapsUrl } from "../index";
import type { GoogleMapsEnvelope } from "../types";
import { LIVE_SHORTLINK_FIXTURES, TEXT_URLS } from "./fixtures";

const LIVE_GOOGLE_API_TESTS = process.env.LIVE_GOOGLE_API_TESTS === "1";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";

function completenessScore(envelope: GoogleMapsEnvelope): number {
  return [
    envelope.location.value !== null,
    envelope.place.value?.formattedAddress !== null,
    envelope.identifiers.placeId !== null,
    envelope.place.value?.city !== null || envelope.place.value?.district !== null,
  ].filter(Boolean).length;
}

function hasProviderDeniedDiagnostics(envelope: GoogleMapsEnvelope): boolean {
  return envelope.diagnostics.some((diagnostic) => diagnostic.code.endsWith("_denied"));
}

describe.if(LIVE_GOOGLE_API_TESTS)("live provider-backed enrichment", () => {
  if (GOOGLE_MAPS_API_KEY === "") {
    test.skip("requires GOOGLE_MAPS_API_KEY when LIVE_GOOGLE_API_TESTS=1", () => {});
    return;
  }

  test(
    "geocoding enriches query-text URLs and preserves stable envelope",
    async () => {
      const baseline = await analyzeGoogleMapsUrl(TEXT_URLS.queryText, {
        mode: "unfurl",
        timeoutMs: 15_000,
      });

      expect(baseline.status).toBe("ok");
      expect(baseline.mode).toBe("unfurl");

      const enriched = await analyzeGoogleMapsUrl(TEXT_URLS.queryText, {
        mode: "enriched",
        raw: { enabled: true },
        timeoutMs: 20_000,
        enrich: {
          google: {
            apiKey: GOOGLE_MAPS_API_KEY,
            enableGeocoding: true,
            enableReverseGeocoding: false,
            enablePlaces: false,
            enableDirections: false,
          },
        },
      });

      expect(enriched.status).toBe("ok");
      expect(enriched.mode).toBe("enriched");

      if (hasProviderDeniedDiagnostics(enriched)) {
        expect(enriched.raw?.providerErrors?.length).toBeGreaterThan(0);
        return;
      }

      expect(enriched.raw?.geocoding).toBeDefined();
      expect(enriched.location.value).not.toBeNull();
      expect(completenessScore(enriched)).toBeGreaterThan(completenessScore(baseline));
    },
    { timeout: 60_000 },
  );

  test(
    "reverse-geocoding enriches shortlink coordinates and raw buckets stay opt-in",
    async () => {
      const fixture = LIVE_SHORTLINK_FIXTURES.find(
        (candidate) => candidate.expectedBehavior === "direct-coords",
      );

      if (fixture === undefined) {
        throw new Error("Missing direct-coords live shortlink fixture.");
      }

      const baseline = await analyzeGoogleMapsUrl(fixture.url, {
        mode: "unfurl",
        enableHtmlFallback: true,
        timeoutMs: 20_000,
      });

      expect(baseline.status).toBe("ok");
      expect(baseline.raw).toBeUndefined();

      const enrichedNoRaw = await analyzeGoogleMapsUrl(fixture.url, {
        mode: "enriched",
        enableHtmlFallback: true,
        timeoutMs: 20_000,
        enrich: {
          google: {
            apiKey: GOOGLE_MAPS_API_KEY,
            enableGeocoding: false,
            enableReverseGeocoding: true,
            enablePlaces: false,
            enableDirections: false,
          },
        },
      });

      expect(enrichedNoRaw.status).toBe("ok");
      expect(enrichedNoRaw.mode).toBe("enriched");
      expect(enrichedNoRaw.raw).toBeUndefined();

      const enrichedWithRaw = await analyzeGoogleMapsUrl(fixture.url, {
        mode: "enriched",
        enableHtmlFallback: true,
        timeoutMs: 20_000,
        raw: { enabled: true },
        enrich: {
          google: {
            apiKey: GOOGLE_MAPS_API_KEY,
            enableGeocoding: false,
            enableReverseGeocoding: true,
            enablePlaces: false,
            enableDirections: false,
          },
        },
      });

      expect(enrichedWithRaw.status).toBe("ok");
      expect(enrichedWithRaw.mode).toBe("enriched");

      if (hasProviderDeniedDiagnostics(enrichedWithRaw)) {
        expect(enrichedWithRaw.raw?.providerErrors?.length).toBeGreaterThan(0);
        return;
      }

      expect(
        enrichedWithRaw.raw?.reverseGeocoding ?? enrichedWithRaw.raw?.geocoding,
      ).toBeDefined();

      const reverseGeocodeStatus = enrichedWithRaw.raw?.reverseGeocoding?.providerStatus;
      if (reverseGeocodeStatus === "OK") {
        expect(completenessScore(enrichedWithRaw)).toBeGreaterThan(
          completenessScore(baseline),
        );
      }

      expect(completenessScore(enrichedWithRaw)).toBeGreaterThanOrEqual(
        completenessScore(baseline),
      );
    },
    { timeout: 60_000 },
  );
});
