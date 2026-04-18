# google-maps-link-parser

Strongly typed Google Maps URL parsing, normalization, short-link unfurling, and optional Google API enrichment for **public shared URLs**.

This package is Bun-first, framework-agnostic, and designed for defensive production use. It separates:

- **parse**: pure URL analysis, zero network
- **unfurl**: SSRF-safe short-link resolution and optional HTML fallback
- **enrich**: optional Google API calls with explicit cost controls

## Why this package exists

Google Maps links are messy in the wild. Real shared links show up as direct URLs, legacy `goo.gl/maps` redirects, `maps.app.goo.gl` short links, `@lat,lng` map views, `q=lat,lng` dropped pins, `data=!3d...!4d...` payloads, place links, directions URLs, and `map_action=map|pano` forms. This library turns those inputs into one stable normalized envelope while keeping raw artifacts opt-in.

## Supported URL forms

- `https://www.google.com/maps/@24.7136,46.6753,15z`
- `https://maps.google.com/?q=24.7136,46.6753`
- `https://www.google.com/maps?ll=24.7136,46.6753`
- `https://www.google.com/maps/place/24.7136,46.6753`
- `https://www.google.com/maps/data=!3d24.7136!4d46.6753`
- `https://www.google.com/maps/place/Riyadh?q=Malaz+Riyadh&ftid=0x123:0x456`
- `https://www.google.com/maps/dir/?api=1&origin=Riyadh&destination=Jeddah`
- `https://www.google.com/maps/search/?api=1&query=Costa+Coffee`
- `https://www.google.com/maps?map_action=pano&viewpoint=24.7136,46.6753`
- `https://maps.app.goo.gl/...`
- `https://goo.gl/maps/...`

## Installation

```bash
# Bun
bun add google-maps-link-parser

# npm
npm install google-maps-link-parser

# pnpm
pnpm add google-maps-link-parser
```

## Quick start

```ts
import { parseGoogleMapsUrl } from "google-maps-link-parser";

const result = parseGoogleMapsUrl("https://www.google.com/maps/@24.7136,46.6753,15z");

if (result.status === "error") {
  throw new Error(result.error?.message ?? "Unexpected parse failure");
}

console.log(result.intent); // => "coordinates"

console.log(result.location.value);
```

Output

```txt
{ latitude: 24.7136, longitude: 46.6753, source: "at-pattern", accuracy: "exact" }
```

## Parse vs unfurl

Use `parseGoogleMapsUrl` when you only need pure URL parsing.

```ts
import { parseGoogleMapsUrl } from "google-maps-link-parser";

const parsed = parseGoogleMapsUrl(
  "https://www.google.com/maps/place/Riyadh?q=Malaz+Riyadh&ftid=0x123:0x456",
);

console.log(parsed.place.value?.title); // => "Riyadh"

console.log(parsed.identifiers.featureId); // => "0x123:0x456"
```

Use `unfurlGoogleMapsUrl` when you need short-link expansion.

```ts
import { unfurlGoogleMapsUrl } from "google-maps-link-parser";

const redirectSteps = [
  {
    status: 302,
    location: "https://www.google.com/maps/@24.7136,46.6753,15z",
  },
  { status: 200 },
];

let redirectIndex = 0;
const mockFetch = async () => {
  const step = redirectSteps[redirectIndex++];
  if (!step) {
    throw new Error("Unexpected fetch call");
  }

  return new Response("", {
    status: step.status,
    headers: step.location ? { Location: step.location } : {},
  });
};

const result = await unfurlGoogleMapsUrl("https://maps.app.goo.gl/abc123?g_st=ic", {
  fetch: mockFetch,
  raw: { enabled: true },
});

console.log(result.resolution.status); // => "resolved"
console.log(result.resolution.resolvedUrl); // => "https://www.google.com/maps/@24.7136,46.6753,15z"
console.log(result.raw?.redirects?.hops);
```

Output

```txt
[
  {
    requestUrl: "https://maps.app.goo.gl/abc123",
    responseStatus: 302,
    locationHeader: "https://www.google.com/maps/@24.7136,46.6753,15z"
  },
  {
    requestUrl: "https://www.google.com/maps/@24.7136,46.6753,15z",
    responseStatus: 200,
    locationHeader: null
  }
]
```

## Optional enrichment

`analyzeGoogleMapsUrl` and `enrichGoogleMapsEnvelope` add Google API lookups only when you opt in.

```ts
import { analyzeGoogleMapsUrl } from "google-maps-link-parser";

const providerFetch = async () =>
  new Response(
    JSON.stringify({
      status: "OK",
      results: [
        {
          formatted_address: "Malaz, Riyadh Saudi Arabia",
          place_id: "place-123",
          geometry: { location: { lat: 24.7136, lng: 46.6753 } },
        },
      ],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );

const result = await analyzeGoogleMapsUrl("https://www.google.com/maps?q=Malaz+Riyadh", {
  mode: "enriched",
  raw: { enabled: true },
  enrich: {
    google: {
      apiKey: "test-key",
      fetch: providerFetch,
    },
  },
});

console.log(result.location.value);
console.log(result.place.value?.formattedAddress); // => "Malaz, Riyadh Saudi Arabia"
```

Output

```txt
{ latitude: 24.7136, longitude: 46.6753, source: "provider-geocoding", accuracy: "approximate" }
```

## Error handling

Safe variants return the normalized envelope with `status: "error"`.
Throwing variants fail fast with typed errors.

```ts
import {
  parseGoogleMapsUrlOrThrow,
  unfurlGoogleMapsUrlOrThrow,
  UnsupportedGoogleMapsUrlError,
} from "google-maps-link-parser";

try {
  parseGoogleMapsUrlOrThrow("https://share.google/example");
} catch (error) {
  if (error instanceof UnsupportedGoogleMapsUrlError) {
    console.error(error.code, error.message);
  }
}

const redirectSteps = [
  {
    status: 302,
    location: "https://www.google.com/maps/@24.7136,46.6753,15z",
  },
  { status: 200 },
];

let redirectIndex = 0;
const mockFetch = async () => {
  const step = redirectSteps[redirectIndex++];
  if (!step) {
    throw new Error("Unexpected fetch call");
  }

  return new Response("", {
    status: step.status,
    headers: step.location ? { Location: step.location } : {},
  });
};

const unfurled = await unfurlGoogleMapsUrlOrThrow(
  "https://maps.app.goo.gl/abc123?g_st=ic",
  {
    fetch: mockFetch,
  },
);
console.log(unfurled.resolution.status); // => "resolved"
```

## Security model

- Only approved Google Maps hostnames are accepted.
- Redirects are validated **hop by hop** against the allow-list.
- Suffix spoofing such as `google.com.evil` is rejected.
- Unsupported auth-gated links such as `share.google` fail clearly.
- Redirect counts and timeouts are bounded.
- Direct coordinate extraction always wins over network work.

## Supported environments

- Bun 1.3+
- Node.js 20.17+
- Browsers for pure parsing helpers
- Edge runtimes and workers for parsing and network helpers that provide `fetch`

## API summary

- `parseGoogleMapsUrl` / `parseGoogleMapsUrlOrThrow`
- `unfurlGoogleMapsUrl` / `unfurlGoogleMapsUrlOrThrow`
- `resolveGoogleMapsUrl` / `resolveGoogleMapsUrlOrThrow`
- `enrichGoogleMapsEnvelope`
- `analyzeGoogleMapsUrl` / `analyzeGoogleMapsUrlOrThrow`
- `isGoogleMapsUrl`
- `canonicalizeGoogleMapsUrl`
- `extractCoordsFromUrl`
- `extractFeatureId`
- `extractGeocodeText`
- `extractQueryText`

## Failure cases

```ts
import { parseGoogleMapsUrl } from "google-maps-link-parser";

console.log(parseGoogleMapsUrl("not-a-url").error?.code); // => "invalid_url"

console.log(parseGoogleMapsUrl("https://bing.com/maps/@24.7,46.6").error?.code); // => "disallowed_hostname"

console.log(parseGoogleMapsUrl("https://share.google/example").error?.code); // => "unsupported_url"
```

## Documentation

- Docs site: `https://gmlp.kdco.dev`
- Local docs: `bun run docs:dev`

## Development

```bash
bun install
bun run check
bun run build

# opt-in live public-network coverage
bun run test:live

# opt-in provider-backed live coverage
LIVE_GOOGLE_API_TESTS=1 GOOGLE_MAPS_API_KEY=your-key bun run test:live:providers
```

## Release model

1. Update `package.json` intentionally.
2. Regenerate `bun.lock` if dependencies changed.
3. Commit the version bump and merge/push that commit to the default branch.
4. Sync your local default-branch tip (`git pull --ff-only`) so `HEAD` exactly matches `origin/<defaultBranch>`.
5. Run preflight on that synced commit: `bun run check && bun run docs:generate-api && bun run docs:build && bun run build`.
6. Run `bun run release:tag`.
7. Use `bun run release:tag:force` only when rerunning the same release commit/version after a partial push failure.
8. GitHub Actions validates the repo, verifies tag/version alignment + default-branch-tip alignment, publishes to npm with provenance, then generates release notes with `git-cliff` and creates a GitHub release.
