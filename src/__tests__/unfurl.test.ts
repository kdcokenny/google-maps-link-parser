import { describe, expect, test } from "bun:test";
import {
  resolveGoogleMapsUrl,
  unfurlGoogleMapsUrl,
  unfurlGoogleMapsUrlOrThrow,
} from "../index";
import { SHORTLINKS, STABLE_COORDINATE_URLS } from "./fixtures";

type MockStep = {
  readonly status: number;
  readonly location?: string;
  readonly body?: string;
};

function createRedirectFetch(steps: readonly MockStep[]) {
  const requestedUrls: string[] = [];
  let index = 0;

  const fetch = async (input: string | URL | Request) => {
    const requestUrl = typeof input === "string" ? input : String(input);
    requestedUrls.push(requestUrl);

    const step = steps[index];
    index += 1;
    if (step === undefined) {
      throw new Error(`Unexpected fetch call for ${requestUrl}`);
    }

    return new Response(step.body ?? "", {
      status: step.status,
      headers: step.location === undefined ? {} : { Location: step.location },
    });
  };

  return {
    fetch,
    requestedUrls,
  };
}

describe("resolveGoogleMapsUrl", () => {
  test("follows a shortlink redirect chain without overfetching when direct coords appear", async () => {
    const mock = createRedirectFetch([
      { status: 302, location: STABLE_COORDINATE_URLS.atPattern },
      { status: 200 },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      raw: { enabled: true },
    });

    expect(result.canonicalUrl).toBe("https://maps.app.goo.gl/abc123");
    expect(result.resolvedUrl).toBe(STABLE_COORDINATE_URLS.atPattern);
    expect(result.redirectCount).toBe(2);
    expect(result.usedHtmlFallback).toBe(false);
    expect(mock.requestedUrls[0]).toBe("https://maps.app.goo.gl/abc123");
  });

  test("preserves a richer q+ftid URL from GET fallback", async () => {
    const mock = createRedirectFetch([
      { status: 302, location: "https://www.google.com/maps/place/Riyadh" },
      { status: 200 },
      {
        status: 302,
        location:
          "https://www.google.com/maps/place/Riyadh?q=Malaz+Riyadh&ftid=0x123:0x456",
      },
      { status: 200, body: "<html><body>No direct coords</body></html>" },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.gooLegacy, {
      fetch: mock.fetch,
    });

    expect(result.resolvedUrl).toBe(
      "https://www.google.com/maps/place/Riyadh?q=Malaz+Riyadh&ftid=0x123:0x456",
    );
    expect(result.usedHtmlFallback).toBe(false);
  });

  test("uses HTML desktop handoff when a maps.app shell hides the destination", async () => {
    const mock = createRedirectFetch([
      { status: 200 },
      {
        status: 200,
        body: '<div data-desktop-link="https://www.google.com/maps/place/Test/@24.7136,46.6753,15z"></div>',
      },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      enableHtmlFallback: true,
      raw: { enabled: true },
    });

    expect(result.resolvedUrl).toBe(
      "https://www.google.com/maps/place/Test/@24.7136,46.6753,15z",
    );
    expect(result.usedHtmlFallback).toBe(true);
    expect(result.raw?.html?.extractedUrls).toContain(
      "https://www.google.com/maps/place/Test/@24.7136,46.6753,15z",
    );
  });

  test("preserves exact decoded place-path handoff URLs with _imcp markers", async () => {
    const placePathHandoffUrl =
      "https://www.google.com/maps/place/%D8%AD%D9%8A+%D8%A7%D9%84%D9%85%D9%84%D8%A7%D8%B2/data=!4m2!3m1!1s0x123:0x456?_imcp=1";
    const mock = createRedirectFetch([
      { status: 200 },
      {
        status: 200,
        body: `<div data-desktop-link="${placePathHandoffUrl}"></div>`,
      },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      raw: { enabled: true },
    });

    expect(result.resolvedUrl).toBe(placePathHandoffUrl);
    expect(result.raw?.html?.extractedUrls).toContain(placePathHandoffUrl);
  });

  test("normalizes escaped separator artifacts in desktop handoff URLs", async () => {
    const normalizedHandoffUrl =
      "https://www.google.com/maps/place/Test?entry=ttu&q=24.7136,46.6753&ftid=0x123:0x456";
    const escapedHandoffUrl =
      "https://www.google.com/maps/place/Test?entry\\u003dttu\\u0026q\\u003d24.7136,46.6753\\u0026ftid\\u003d0x123:0x456";
    const mock = createRedirectFetch([
      { status: 200 },
      {
        status: 200,
        body: `<div data-desktop-link="${escapedHandoffUrl}"></div>`,
      },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      raw: { enabled: true },
    });

    expect(result.resolvedUrl).toBe(normalizedHandoffUrl);
    expect(result.usedHtmlFallback).toBe(true);
    expect(result.raw?.html?.extractedUrls).toContain(normalizedHandoffUrl);
  });

  test("normalizes \\u0026amp; artifacts in desktop handoff URLs", async () => {
    const normalizedHandoffUrl =
      "https://www.google.com/maps/place/Test?entry=ttu&q=24.7136,46.6753&ftid=0x123:0x456";
    const escapedAmpHandoffUrl =
      "https://www.google.com/maps/place/Test?entry\\u003dttu\\u0026amp;q\\u003d24.7136,46.6753\\u0026amp;ftid\\u003d0x123:0x456";
    const mock = createRedirectFetch([
      { status: 200 },
      {
        status: 200,
        body: `<div data-desktop-link="${escapedAmpHandoffUrl}"></div>`,
      },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      raw: { enabled: true },
    });

    expect(result.resolvedUrl).toBe(normalizedHandoffUrl);
    expect(result.usedHtmlFallback).toBe(true);
    expect(result.raw?.html?.extractedUrls).toContain(normalizedHandoffUrl);
  });

  test("recovers one layer of %25-encoded separators for safe query keys", async () => {
    const normalizedHandoffUrl =
      "https://www.google.com/maps/place/Test?entry=ttu&ll=24.7136,46.6753&ftid=0x123:0x456";
    const percentEncodedHandoffUrl =
      "https://www.google.com/maps/place/Test?entry%253Dttu%2526ll%253D24.7136,46.6753%2526ftid%253D0x123:0x456";
    const mock = createRedirectFetch([
      { status: 200 },
      {
        status: 200,
        body: `<div data-desktop-link="${percentEncodedHandoffUrl}"></div>`,
      },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      raw: { enabled: true },
    });

    expect(result.resolvedUrl).toBe(normalizedHandoffUrl);
    expect(result.usedHtmlFallback).toBe(true);
    expect(result.raw?.html?.extractedUrls).toContain(normalizedHandoffUrl);
  });

  test("does not over-decode unrelated one-level escapes during %25 recovery", async () => {
    const preservedValueHandoffUrl =
      "https://www.google.com/maps/place/Test?entry=ttu&ll=24.7136,46.6753&query=AT%252F%2523%253F";
    const encodedValueHandoffUrl =
      "https://www.google.com/maps/place/Test?entry%253Dttu%2526ll%253D24.7136,46.6753&query=AT%252F%2523%253F";
    const mock = createRedirectFetch([
      { status: 200 },
      {
        status: 200,
        body: `<div data-desktop-link="${encodedValueHandoffUrl}"></div>`,
      },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      raw: { enabled: true },
    });

    expect(result.resolvedUrl).toBe(preservedValueHandoffUrl);
    expect(result.usedHtmlFallback).toBe(true);
    expect(result.raw?.html?.extractedUrls).toContain(preservedValueHandoffUrl);
  });

  test("does not split ambiguous text-like encoded key-value shapes", async () => {
    const preservedAmbiguousHandoffUrl =
      "https://www.google.com/maps/place/Test?q%3Dfoo%26destination%3Dbar";
    const encodedAmbiguousHandoffUrl =
      "https://www.google.com/maps/place/Test?q%253Dfoo%2526destination%253Dbar";
    const mock = createRedirectFetch([
      { status: 200 },
      {
        status: 200,
        body: `<div data-desktop-link="${encodedAmbiguousHandoffUrl}"></div>`,
      },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      raw: { enabled: true },
    });

    expect(result.resolvedUrl).toBe(preservedAmbiguousHandoffUrl);
    expect(result.usedHtmlFallback).toBe(true);
    expect(result.raw?.html?.extractedUrls).toContain(preservedAmbiguousHandoffUrl);
  });

  test("normalizes escaped separators in embedded Google Maps URLs", async () => {
    const normalizedEmbeddedUrl =
      "https://www.google.com/maps/place/Test?entry=ttu&q=24.7136,46.6753&ftid=0xabc:0xdef";
    const escapedEmbeddedUrl =
      "https://www.google.com/maps/place/Test?entry\\u003dttu/u0026amp;q\\u003d24.7136,46.6753/u0026ftid\\u003d0xabc:0xdef";
    const mock = createRedirectFetch([
      { status: 200 },
      {
        status: 200,
        body: `<html><body><script>window.__maps='${escapedEmbeddedUrl}'</script></body></html>`,
      },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      raw: { enabled: true },
    });

    expect(result.resolvedUrl).toBe(normalizedEmbeddedUrl);
    expect(result.usedHtmlFallback).toBe(true);
    expect(result.raw?.html?.extractedUrls).toContain(normalizedEmbeddedUrl);
  });

  test("recursively re-follows shortlink handoffs discovered in HTML shells", async () => {
    const shortLinkHandoff = "https://maps.app.goo.gl/handoff123?_imcp=1";
    const finalPlacePathUrl =
      "https://www.google.com/maps/place/%D8%AD%D9%8A+%D8%A7%D9%84%D9%85%D9%84%D8%A7%D8%B2/data=!4m2!3m1!1s0x123:0x456";
    const mock = createRedirectFetch([
      { status: 200 },
      {
        status: 200,
        body: `<html><body><div data-desktop-link="${shortLinkHandoff}"></div></body></html>`,
      },
      { status: 302, location: finalPlacePathUrl },
      { status: 200 },
      { status: 200, body: "<html><body>No direct coords</body></html>" },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      raw: { enabled: true },
    });

    expect(result.resolvedUrl).toBe(finalPlacePathUrl);
    expect(mock.requestedUrls).toEqual([
      "https://maps.app.goo.gl/abc123",
      "https://maps.app.goo.gl/abc123",
      shortLinkHandoff,
      finalPlacePathUrl,
      finalPlacePathUrl,
    ]);
  });

  test("prevents recursive shortlink handoff loops", async () => {
    const firstShortLink = "https://maps.app.goo.gl/abc123";
    const secondShortLink = "https://maps.app.goo.gl/loop123?_imcp=1";
    const mock = createRedirectFetch([
      { status: 200 },
      {
        status: 200,
        body: `<html><body><div data-desktop-link="${secondShortLink}"></div></body></html>`,
      },
      { status: 200 },
      {
        status: 200,
        body: `<html><body><div data-desktop-link="${firstShortLink}"></div></body></html>`,
      },
    ]);

    const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      raw: { enabled: true },
    });

    expect(result.resolvedUrl).toBe(firstShortLink);
    expect(result.redirectCount).toBe(4);
    expect(mock.requestedUrls).toEqual([
      firstShortLink,
      firstShortLink,
      secondShortLink,
      secondShortLink,
    ]);
  });

  test("rejects unsafe data-desktop-link values", async () => {
    for (const handoff of [
      "javascript:alert(1)",
      "ftp://maps.app.goo.gl/unsafe",
      "https://evil.com/steal",
      "%E0%A4%A",
    ]) {
      const mock = createRedirectFetch([
        { status: 200 },
        {
          status: 200,
          body: `<html><body><div data-desktop-link="${handoff}"></div></body></html>`,
        },
      ]);

      // eslint-disable-next-line no-await-in-loop -- Each handoff case uses isolated mock state.
      const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
        fetch: mock.fetch,
      });

      expect(result.resolvedUrl).toBe("https://maps.app.goo.gl/abc123");
    }
  });

  test("fails closed for malformed or over-decoded HTML handoff artifacts", async () => {
    for (const handoff of [
      "https://www.google.com/maps/place/Test\\u00ZZ?q=24.7136,46.6753",
      "javascript\\u003aalert(1)",
      "https://evil.com/maps/place/Test?entry\\u003dttu\\u0026q\\u003d24.7136,46.6753",
      "https%25253A%25252F%25252Fwww.google.com%25252Fmaps%25252Fplace%25252FTest%25253Fq%25253D24.7136%25252C46.6753",
    ]) {
      const mock = createRedirectFetch([
        { status: 200 },
        {
          status: 200,
          body: `<html><body><div data-desktop-link="${handoff}"></div></body></html>`,
        },
      ]);

      // eslint-disable-next-line no-await-in-loop -- Each handoff case uses isolated mock state.
      const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp, {
        fetch: mock.fetch,
        raw: { enabled: true },
      });

      expect(result.resolvedUrl).toBe("https://maps.app.goo.gl/abc123");
    }
  });
});

describe("unfurlGoogleMapsUrl", () => {
  test("returns an unfurled envelope for shortlinks", async () => {
    const mock = createRedirectFetch([
      { status: 302, location: STABLE_COORDINATE_URLS.atPattern },
      { status: 200 },
    ]);

    const result = await unfurlGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
      raw: { enabled: true },
    });

    expect(result.status).toBe("ok");
    expect(result.mode).toBe("unfurl");
    expect(result.input.isShortLink).toBe(true);
    expect(result.resolution.status).toBe("resolved");
    expect(result.resolution.resolvedUrl).toBe(STABLE_COORDINATE_URLS.atPattern);
    expect(result.location.value?.latitude).toBe(24.7136);
    expect(result.raw?.redirects?.hops.length).toBe(2);
  });

  test("marks dead shortlinks without crashing", async () => {
    const mock = createRedirectFetch([{ status: 404 }]);

    const result = await unfurlGoogleMapsUrl(SHORTLINKS.gooLegacy, {
      fetch: mock.fetch,
    });

    expect(result.status).toBe("ok");
    expect(result.mode).toBe("unfurl");
    expect(result.resolution.status).toBe("dead-end");
    expect(result.diagnostics.some((item) => item.code === "dead_shortlink")).toBe(true);
  });

  test("returns a safe error envelope for disallowed redirect hops", async () => {
    const mock = createRedirectFetch([
      { status: 302, location: "https://evil.com/steal-data" },
    ]);

    const result = await unfurlGoogleMapsUrl(SHORTLINKS.mapsApp, {
      fetch: mock.fetch,
    });

    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("disallowed_hostname");
  });

  test("throw variant throws for disallowed redirect hops", async () => {
    const mock = createRedirectFetch([
      { status: 302, location: "https://evil.com/steal-data" },
    ]);

    await expect(
      unfurlGoogleMapsUrlOrThrow(SHORTLINKS.mapsApp, {
        fetch: mock.fetch,
      }),
    ).rejects.toThrow("Hostname is not an allowed Google Maps host.");
  });
});
