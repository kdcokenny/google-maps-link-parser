/**
 * Live-network integration coverage for public Google Maps URLs.
 *
 * Opt-in only:
 *   LIVE_NETWORK_TESTS=1 bun test src/__tests__/live-network.test.ts
 *   bun run test:live
 */
import { describe, expect, test } from "bun:test";
import {
  analyzeGoogleMapsUrl,
  canonicalizeGoogleMapsUrl,
  extractFeatureId,
  extractGeocodeText,
  isGoogleMapsUrl,
} from "../index";
import type { GoogleMapsEnvelope } from "../types";
import {
  LIVE_FAIL_FAST_FIXTURES,
  LIVE_SHORTLINK_FIXTURES,
  LIVE_STABLE_DIRECT_FIXTURES,
} from "./fixtures";

const LIVE_NETWORK_TESTS = process.env.LIVE_NETWORK_TESTS === "1";

function normalizeUrlCandidate(rawValue: string, baseUrl?: string): string | null {
  const trimmed = rawValue.trim();
  if (trimmed === "") return null;

  try {
    return baseUrl === undefined
      ? new URL(trimmed).toString()
      : new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function collectResolutionCandidates(envelope: GoogleMapsEnvelope): readonly string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const add = (value: string | null | undefined, baseUrl?: string) => {
    if (value === null || value === undefined) return;
    const normalized = normalizeUrlCandidate(value, baseUrl);
    if (normalized === null || seen.has(normalized)) return;

    seen.add(normalized);
    candidates.push(normalized);
  };

  add(envelope.resolution.resolvedUrl);
  add(envelope.raw?.resolvedUrl?.finalUrl);

  for (const hop of envelope.raw?.redirects?.hops ?? []) {
    add(hop.requestUrl);
    add(hop.locationHeader, hop.requestUrl);
  }

  for (const extracted of envelope.raw?.html?.extractedUrls ?? []) {
    add(extracted);
  }

  return candidates;
}

function collectQuerySignals(envelope: GoogleMapsEnvelope): {
  readonly geocodeTexts: readonly string[];
  readonly featureIds: readonly string[];
} {
  const candidates = collectResolutionCandidates(envelope);

  const geocodeTexts = Array.from(
    new Set(
      candidates
        .map((candidate) => extractGeocodeText(candidate))
        .filter((value): value is string => value !== null && value.trim() !== ""),
    ),
  );

  const featureIds = Array.from(
    new Set(
      candidates
        .map((candidate) => extractFeatureId(candidate))
        .filter((value): value is string => value !== null),
    ),
  );

  return {
    geocodeTexts,
    featureIds,
  };
}

describe.if(LIVE_NETWORK_TESTS)("live public Google Maps URL integration", () => {
  describe("minimal mode fixtures", () => {
    for (const fixture of LIVE_STABLE_DIRECT_FIXTURES) {
      test(fixture.label, async () => {
        const result = await analyzeGoogleMapsUrl(fixture.url, {
          mode: "minimal",
        });

        expect(result.status).toBe("ok");
        expect(result.mode).toBe("minimal");
        expect(result.input.isGoogleMapsUrl).toBe(true);
        expect(result.input.isShortLink).toBe(false);
        expect(result.resolution.status).toBe("not-needed");
        expect(result.location.value).toEqual({
          latitude: fixture.expectedLatitude,
          longitude: fixture.expectedLongitude,
          source: fixture.expectedSource,
          accuracy: "exact",
        });
        if (fixture.allowedIntents !== undefined) {
          expect(fixture.allowedIntents.includes(result.intent)).toBe(true);
        }

        expect(result.raw).toBeUndefined();
      });
    }

    for (const fixture of LIVE_SHORTLINK_FIXTURES) {
      test(`${fixture.label} (minimal shortlink envelope)`, async () => {
        const result = await analyzeGoogleMapsUrl(fixture.url, {
          mode: "minimal",
        });

        const expectedCanonical = canonicalizeGoogleMapsUrl(fixture.url);

        expect(result.status).toBe("ok");
        expect(result.mode).toBe("minimal");
        expect(result.input.isGoogleMapsUrl).toBe(true);
        expect(result.input.isShortLink).toBe(true);
        expect(result.input.normalized).toBe(expectedCanonical);
        expect(result.resolution.status).toBe("not-attempted");
        expect(result.raw).toBeUndefined();

        if (fixture.url.includes("g_st=")) {
          expect(result.input.canonicalized).toBe(expectedCanonical);
        }
      });
    }

    for (const fixture of LIVE_FAIL_FAST_FIXTURES) {
      test(fixture.label, async () => {
        const result = await analyzeGoogleMapsUrl(fixture.url, {
          mode: "minimal",
        });

        expect(result.status).toBe("error");
        expect(result.error?.code).toBe(fixture.expectedErrorCode);
      });
    }
  });

  describe("unfurl mode fixtures", () => {
    for (const fixture of LIVE_SHORTLINK_FIXTURES) {
      test(
        `${fixture.label} (${fixture.expectedBehavior})`,
        async () => {
          const result = await analyzeGoogleMapsUrl(fixture.url, {
            mode: "unfurl",
            enableHtmlFallback: true,
            timeoutMs: 20_000,
            raw: { enabled: true },
          });

          expect(result.status).toBe("ok");
          expect(result.mode).toBe("unfurl");
          expect(result.input.isShortLink).toBe(true);
          expect(result.resolution.status).toBe("resolved");
          expect(result.resolution.resolvedUrl).not.toBeNull();
          expect(isGoogleMapsUrl(result.resolution.resolvedUrl ?? "")).toBe(true);

          expect(result.raw?.redirects?.hops.length).toBeGreaterThan(0);
          expect(result.raw?.resolvedUrl?.finalUrl).toBe(
            result.resolution.resolvedUrl ?? undefined,
          );
          expect(result.raw?.geocoding).toBeUndefined();
          expect(result.raw?.reverseGeocoding).toBeUndefined();
          expect(result.raw?.places).toBeUndefined();
          expect(result.raw?.directions).toBeUndefined();
          expect(result.raw?.providerErrors).toBeUndefined();

          if (fixture.allowedIntents !== undefined) {
            expect(fixture.allowedIntents.includes(result.intent)).toBe(true);
          }

          if (fixture.expectedBehavior === "direct-coords") {
            expect(result.location.value).not.toBeNull();
            expect(Number.isFinite(result.location.value?.latitude)).toBe(true);
            expect(Number.isFinite(result.location.value?.longitude)).toBe(true);
            expect(
              fixture.allowedCoordinateSources.includes(
                result.location.value?.source ?? ("" as never),
              ),
            ).toBe(true);
            return;
          }

          const querySignals = collectQuerySignals(result);
          expect(
            querySignals.geocodeTexts.length > 0 || querySignals.featureIds.length > 0,
          ).toBe(true);
        },
        { timeout: 30_000 },
      );
    }

    test(
      "unfurl mode keeps raw provider buckets hidden by default",
      async () => {
        const fixture = LIVE_SHORTLINK_FIXTURES[0];
        if (fixture === undefined) {
          throw new Error("Missing live shortlink fixture.");
        }

        const result = await analyzeGoogleMapsUrl(fixture.url, {
          mode: "unfurl",
          enableHtmlFallback: true,
          timeoutMs: 20_000,
        });

        expect(result.status).toBe("ok");
        expect(result.raw).toBeUndefined();
      },
      { timeout: 30_000 },
    );
  });
});
