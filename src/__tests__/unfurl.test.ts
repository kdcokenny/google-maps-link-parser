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
