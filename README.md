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

console.log(result.intent);
// "coordinates"

console.log(result.location.value);
// {
//   latitude: 24.7136,
//   longitude: 46.6753,
//   source: "at-pattern",
//   accuracy: "exact"
// }
```

## Parse vs unfurl

Use `parseGoogleMapsUrl` when you only need pure URL parsing.

```ts
import { parseGoogleMapsUrl } from "google-maps-link-parser";

const parsed = parseGoogleMapsUrl(
  "https://www.google.com/maps/place/Riyadh?q=Malaz+Riyadh&ftid=0x123:0x456",
);

console.log(parsed.place.value?.title);
// "Riyadh"

console.log(parsed.identifiers.featureId);
// "0x123:0x456"
```

Use `unfurlGoogleMapsUrl` when you need short-link expansion.

```ts
import { unfurlGoogleMapsUrl } from "google-maps-link-parser";

const result = await unfurlGoogleMapsUrl("https://maps.app.goo.gl/example", {
  raw: { enabled: true },
});

console.log(result.resolution.resolvedUrl);
console.log(result.raw?.redirects?.hops);
```

## Optional enrichment

`analyzeGoogleMapsUrl` and `enrichGoogleMapsEnvelope` add Google API lookups only when you opt in.

```ts
import { analyzeGoogleMapsUrl } from "google-maps-link-parser";

const result = await analyzeGoogleMapsUrl("https://www.google.com/maps?q=Malaz+Riyadh", {
  mode: "enriched",
  enrich: {
    policy: "when-needed",
    google: {
      apiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
      enablePlaces: true,
      enableDirections: false,
    },
  },
});

console.log(result.location.value);
console.log(result.place.value?.formattedAddress);
console.log(result.raw?.geocoding);
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
  const parsed = parseGoogleMapsUrlOrThrow("https://share.google/example");
  console.log(parsed.intent);
} catch (error) {
  if (error instanceof UnsupportedGoogleMapsUrlError) {
    console.error(error.code, error.message);
  }
}

const unfurled = await unfurlGoogleMapsUrlOrThrow("https://maps.app.goo.gl/example");
console.log(unfurled.resolution.status);
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

console.log(parseGoogleMapsUrl("not-a-url").error);
// { code: "invalid_url", message: "Input is not a valid URL." }

console.log(parseGoogleMapsUrl("https://bing.com/maps/@24.7,46.6").error);
// { code: "disallowed_hostname", message: "Hostname is not an allowed Google Maps host." }

console.log(parseGoogleMapsUrl("https://share.google/example").error);
// { code: "unsupported_url", message: "share.google links are recognized but unsupported for public resolution." }
```

## Documentation

- Docs site: `https://google-maps-link-parser.mintlify.app`
- Local docs: `bun run docs:dev`

## Development

```bash
bun install
bun run check
bun run build
```

## Release model

1. Update `package.json` intentionally.
2. Regenerate `bun.lock` if dependencies changed.
3. Commit with conventional commits.
4. Push a semver tag such as `v0.1.0`.
5. GitHub Actions runs validation, generates release notes with `git-cliff`, creates a GitHub release, and publishes to npm with provenance.
