import { describe, expect, test } from "bun:test";
import { resolveGoogleMapsUrl, unfurlGoogleMapsUrl } from "../index";
import { SHORTLINKS, STABLE_COORDINATE_URLS } from "./fixtures";

const LIVE_NETWORK_TESTS = process.env.LIVE_NETWORK_TESTS === "1";

describe.if(LIVE_NETWORK_TESTS)("live network smoke tests", () => {
  test(
    "direct coordinate URL stays zero-network friendly",
    async () => {
      const result = await unfurlGoogleMapsUrl(STABLE_COORDINATE_URLS.atPattern);
      expect(result.status).toBe("ok");
      expect(result.location.value?.latitude).toBe(24.7136);
      expect(result.resolution.status).toBe("not-needed");
    },
    { timeout: 15_000 },
  );

  test(
    "maps.app shortlink resolves to a Google Maps URL",
    async () => {
      const result = await resolveGoogleMapsUrl(SHORTLINKS.mapsApp);
      expect(result.resolvedUrl.startsWith("https://")).toBe(true);
      expect(result.resolvedUrl.includes("google")).toBe(true);
    },
    { timeout: 20_000 },
  );
});
