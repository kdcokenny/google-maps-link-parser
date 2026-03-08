# Package / Repo Overview

This repository is a single-package Bun-first TypeScript library for parsing, normalizing, unfurling, and optionally enriching **public** Google Maps URLs.

## Architecture

- `src/parser.ts`: pure URL parsing and normalized envelope creation
- `src/unfurl.ts`: SSRF-safe short-link resolution and HTML fallback
- `src/enrich.ts`: optional Google API enrichment with typed denied/error handling
- `src/analyze.ts`: mode-aware entrypoint across `minimal`, `unfurl`, and `enriched`
- `docs/`: Mintlify docs with getting-started, concepts, guides, examples, and API reference
- `.github/workflows/`: CI, release, PR-title validation, and preview publishing

## File Tree

```txt
.github/workflows/ci.yml
.github/workflows/pr-title.yml
.github/workflows/preview.yml
.github/workflows/release.yml
.gitignore
.husky/_/husky.sh
.husky/commit-msg
.mintignore
.oxfmtrc.jsonc
.oxlintrc.json
CONTRIBUTING.md
LICENSE
README.md
bunfig.toml
bunup.config.ts
cliff.toml
commitlint.config.ts
docs/AGENTS.md
docs/api-reference/errors.mdx
docs/api-reference/generated/.gitkeep
docs/api-reference/overview.mdx
docs/api-reference/types.mdx
docs/concepts/parse-vs-unfurl-vs-enrich.mdx
docs/concepts/parsing-model.mdx
docs/concepts/security-model.mdx
docs/docs.json
docs/examples/browser-usage.mdx
docs/examples/node-usage.mdx
docs/favicon.svg
docs/getting-started/installation.mdx
docs/getting-started/quick-start.mdx
docs/guides/error-handling.mdx
docs/guides/handle-short-links.mdx
docs/guides/parse-coordinates.mdx
docs/guides/raw-artifacts.mdx
docs/index.mdx
docs/logo/dark.svg
docs/logo/light.svg
docs/releases.mdx
package.json
src/__tests__/analyze.test.ts
src/__tests__/fixtures.ts
src/__tests__/live-network.test.ts
src/__tests__/parser.test.ts
src/__tests__/unfurl.test.ts
src/analyze.ts
src/domain.ts
src/enrich.ts
src/errors.ts
src/guards.ts
src/html-extract.ts
src/index.ts
src/normalize.ts
src/parser.ts
src/types.ts
src/unfurl.ts
tsconfig.json
typedoc.json
```

## Full File Contents

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.3

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.17.0

      - name: Install dependencies
        run: |
          if [ -f bun.lock ]; then
            bun install --frozen-lockfile
          else
            echo "bun.lock is missing. Generating a temporary lockfile for CI bootstrap."
            bun install
          fi

      - name: Format
        run: bun run check:format

      - name: Lint
        run: bun run check:lint

      - name: Type check
        run: bun run check:types

      - name: Test
        run: bun run test

      - name: Generate API docs
        run: bun run docs:generate-api

      - name: Validate docs
        run: bun run docs:build

      - name: Build package
        run: bun run build
```

### `.github/workflows/pr-title.yml`

```yaml
name: PR Title

on:
  pull_request_target:
    types: [opened, edited, synchronize, reopened]

permissions:
  pull-requests: read

jobs:
  semantic-title:
    runs-on: ubuntu-latest
    steps:
      - name: Validate PR title
        uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            docs
            refactor
            perf
            test
            build
            ci
            chore
            revert
          requireScope: false
          subjectPattern: ^(?![A-Z]).+$
          validateSingleCommit: false
```

### `.github/workflows/preview.yml`

```yaml
name: Preview Package

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  preview:
    if: github.event.pull_request.head.repo.fork == false
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.3

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.17.0

      - name: Install dependencies
        run: |
          if [ -f bun.lock ]; then
            bun install --frozen-lockfile
          else
            echo "bun.lock is missing. Generating a temporary lockfile for preview bootstrap."
            bun install
          fi

      - name: Build package
        run: bun run build

      - name: Publish preview package
        run: npx pkg-pr-new publish ./
```

### `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - "v*.*.*"

permissions:
  contents: write
  id-token: write

jobs:
  release:
    if: github.event.repository.fork == false
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.3

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.17.0

      - name: Install dependencies
        run: |
          if [ -f bun.lock ]; then
            bun install --frozen-lockfile
          else
            echo "bun.lock is missing. Generating a temporary lockfile for release bootstrap."
            bun install
          fi

      - name: Validate repository
        run: bun run check

      - name: Generate API docs
        run: bun run docs:generate-api

      - name: Validate docs
        run: bun run docs:build

      - name: Build package
        run: bun run build

      - name: Generate release notes
        id: git_cliff
        uses: orhun/git-cliff-action@v4
        with:
          config: cliff.toml
          args: --latest --strip all
        env:
          OUTPUT: CHANGELOG_RELEASE.md
          GITHUB_REPO: ${{ github.repository }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body_path: CHANGELOG_RELEASE.md
          generate_release_notes: false

      - name: Publish to npm with provenance
        run: npm publish --provenance --access public
```

### `.gitignore`

```
# dependencies
node_modules/

# build outputs
dist/
coverage/

# docs build artifacts
docs/.mint/
docs/api-reference/generated/

# editor and operating system noise
.DS_Store
.vscode/
.idea/

# local env
.env
.env.*

# package manager
bun.lockb
```

### `.husky/_/husky.sh`

```sh
#!/usr/bin/env sh
if [ -z "$husky_skip_init" ]; then
  export husky_skip_init=1
  sh "$0" "$@"
  exit $?
fi
```

### `.husky/commit-msg`

```
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

bunx commitlint --edit "$1"
```

### `.mintignore`

```
node_modules
coverage
dist
```

### `.oxfmtrc.jsonc`

```jsonc
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 90,
  "tabWidth": 2,
}
```

### `.oxlintrc.json`

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "import", "node"],
  "categories": {
    "correctness": "error",
    "suspicious": "error",
    "perf": "warn"
  },
  "rules": {
    "eslint/no-unused-vars": "error",
    "import/no-duplicates": "error",
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error"
  },
  "overrides": [
    {
      "files": ["src/__tests__/*.ts"],
      "rules": {
        "typescript/no-explicit-any": "off"
      }
    }
  ]
}
```

### `CONTRIBUTING.md`

````md
# Contributing

## Local setup

1. Install Bun 1.3.x.
2. Install Node.js 20.17+ because the Mintlify CLI requires a modern Node runtime.
3. Clone the repository.
4. Install dependencies:

```bash
bun install
```
````

If this is the very first install and `bun.lock` does not exist yet, generate it once:

```bash
bun install --save-text-lockfile --lockfile-only
```

## Scripts

```bash
bun run build
bun run dev
bun run check
bun run check:format
bun run check:lint
bun run check:types
bun run test
bun run test:coverage
bun run docs:dev
bun run docs:build
bun run docs:generate-api
```

## Test strategy

- Unit tests use Bun's built-in test runner.
- Core redirect and HTML fallback behavior is mocked deterministically.
- Live network tests are opt-in and must never run in normal CI.
- Provider denied responses are tested as typed outcomes, not crashes.

## Docs workflow

- Author docs in `docs/` using Mintlify MDX.
- Preview locally with `bun run docs:dev`.
- Generate API JSON with `bun run docs:generate-api`.
- Validate links and docs build with `bun run docs:build`.

## Conventional commits

Use conventional commits with a relevant scope.
Examples:

- `feat(parser): support map_action=pano URLs`
- `fix(unfurl): reject off-domain redirect hops`
- `docs(guides): explain raw artifact capture`

Commit messages are linted by the `commit-msg` hook.

## Release process

1. Ensure `bun run check`, `bun run docs:generate-api`, and `bun run build` are clean.
2. Update the version intentionally in `package.json`.
3. Commit the version bump.
4. Push a semver tag like `v0.2.0`.
5. The release workflow validates the repo, generates notes with `git-cliff`, creates a GitHub release, and publishes to npm using trusted publishing.

## Notes for maintainers

- Replace all `REPLACE_ME` placeholders before first public publish.
- Configure npm trusted publishing against `.github/workflows/release.yml`.
- Commit `bun.lock` once generated; the workflow can bootstrap it if missing, but committed lockfiles should be the steady state.

```

### `LICENSE`

```

MIT License

Copyright (c) 2026 REPLACE_ME

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

````

### `README.md`

```md
# @replace-me/google-maps-url-kit

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
bun add @replace-me/google-maps-url-kit

# npm
npm install @replace-me/google-maps-url-kit

# pnpm
pnpm add @replace-me/google-maps-url-kit
````

## Quick start

```ts
import { parseGoogleMapsUrl } from "@replace-me/google-maps-url-kit";

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
import { parseGoogleMapsUrl } from "@replace-me/google-maps-url-kit";

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
import { unfurlGoogleMapsUrl } from "@replace-me/google-maps-url-kit";

const result = await unfurlGoogleMapsUrl("https://maps.app.goo.gl/example", {
  raw: { enabled: true },
});

console.log(result.resolution.resolvedUrl);
console.log(result.raw?.redirects?.hops);
```

## Optional enrichment

`analyzeGoogleMapsUrl` and `enrichGoogleMapsEnvelope` add Google API lookups only when you opt in.

```ts
import { analyzeGoogleMapsUrl } from "@replace-me/google-maps-url-kit";

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
} from "@replace-me/google-maps-url-kit";

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
import { parseGoogleMapsUrl } from "@replace-me/google-maps-url-kit";

console.log(parseGoogleMapsUrl("not-a-url").error);
// { code: "invalid_url", message: "Input is not a valid URL." }

console.log(parseGoogleMapsUrl("https://bing.com/maps/@24.7,46.6").error);
// { code: "disallowed_hostname", message: "Hostname is not an allowed Google Maps host." }

console.log(parseGoogleMapsUrl("https://share.google/example").error);
// { code: "unsupported_url", message: "share.google links are recognized but unsupported for public resolution." }
```

## Documentation

- Docs site: `https://REPLACE_ME.mintlify.app`
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

````

### `bunfig.toml`

```toml
[install]
exact = true
````

### `bunup.config.ts`

```ts
import { defineConfig } from "bunup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node",
});
```

### `cliff.toml`

```toml
[changelog]
header = """
# Changelog

All notable changes to this project are documented here.
"""
body = """
{% if version %}
## {{ version }} - {{ timestamp | date(format=\"%Y-%m-%d\") }}
{% else %}
## Unreleased
{% endif %}

{% for group, commits in commits | group_by(attribute=\"group\") %}
### {{ group }}
{% for commit in commits %}
- {% if commit.scope %}**{{ commit.scope }}:** {% endif %}{{ commit.message | upper_first }}
{% endfor %}
{% endfor %}
"""
footer = """
<!-- generated by git-cliff -->
"""
trim = true

[git]
conventional_commits = true
filter_unconventional = true
tag_pattern = "v[0-9]*"
skip_tags = ""
ignore_tags = ""
sort_commits = "oldest"

[[git.commit_parsers]]
message = "^feat"
group = "Features"

[[git.commit_parsers]]
message = "^fix"
group = "Fixes"

[[git.commit_parsers]]
message = "^docs"
group = "Documentation"

[[git.commit_parsers]]
message = "^test"
group = "Tests"

[[git.commit_parsers]]
message = "^refactor"
group = "Refactors"

[[git.commit_parsers]]
message = "^chore|^build|^ci"
group = "Chores"
```

### `commitlint.config.ts`

```ts
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      ["core", "parser", "unfurl", "enrich", "docs", "tests", "ci", "release", "tooling"],
    ],
    "subject-case": [
      2,
      "never",
      ["sentence-case", "start-case", "pascal-case", "upper-case"],
    ],
  },
};

export default config;
```

### `docs/AGENTS.md`

```md
# Docs maintenance notes

- Keep examples aligned with the exported public API from `src/index.ts`.
- Prefer hand-written conceptual docs over generated API dumps.
- Raw artifacts are opt-in; do not document them as default behavior.
- The package only supports public shared Google Maps URLs.
- Replace `REPLACE_ME` placeholders before first public publish.
```

### `docs/api-reference/errors.mdx`

```mdx
---
title: Errors
description: Typed error classes and when to use them.
---

## Error classes

- `GoogleMapsUrlError`
- `EmptyInputError`
- `InvalidGoogleMapsUrlError`
- `DisallowedHostnameError`
- `UnsupportedGoogleMapsUrlError`
- `RedirectLimitError`
- `NetworkTimeoutError`
- `NetworkRequestError`
- `GoogleProviderError`

## Guidance

Use throwing variants when invalid URLs should interrupt the request immediately.
Use safe variants when you want a single return shape throughout the call chain.
```

### `docs/api-reference/generated/.gitkeep`

```

```

### `docs/api-reference/overview.mdx`

```mdx
---
title: API overview
description: The main public functions and how they fit together.
---

## Core functions

### `parseGoogleMapsUrl`

Safe, pure parsing with zero network requests.

### `parseGoogleMapsUrlOrThrow`

Throwing parse variant for strict request boundaries.

### `resolveGoogleMapsUrl`

Low-level short-link resolver. Returns the resolved URL plus redirect metadata.

### `unfurlGoogleMapsUrl`

Safe high-level unfurl helper that returns the normalized envelope.

### `unfurlGoogleMapsUrlOrThrow`

Throwing unfurl variant.

### `analyzeGoogleMapsUrl`

Mode-aware helper for `minimal`, `unfurl`, and `enriched` workflows.

### `enrichGoogleMapsEnvelope`

Provider enrichment for an existing normalized envelope.

## Generated API docs

`bun run docs:generate-api` writes TypeDoc output to `docs/api-reference/generated/`.

Use the generated JSON as an implementation reference. Keep the hand-written pages as the primary conceptual documentation.
```

### `docs/api-reference/types.mdx`

```mdx
---
title: Types
description: Key public types exposed by the package.
---

Important exported types include:

- `GoogleMapsEnvelope`
- `GoogleMapsIntent`
- `GoogleMapsMode`
- `LocationData`
- `PlaceData`
- `RouteData`
- `QueryData`
- `MapViewData`
- `ResolvedGoogleMapsUrl`
- `RawArtifacts`
- `CoordinateSource`
- `ResolutionStatus`

The library favors discriminated unions and narrow string literals over loose bags of data.
```

### `docs/concepts/parse-vs-unfurl-vs-enrich.mdx`

```mdx
---
title: Parse vs unfurl vs enrich
description: Choose the right mode for your cost, latency, and accuracy needs.
---

## `minimal`

`minimal` never performs network requests.

Use it when:

- you already have a full Google Maps URL
- you only need coordinates or typed URL metadata
- you want deterministic, cheap parsing in hot code paths

## `unfurl`

`unfurl` allows public redirect resolution and optional HTML fallback.

Use it when:

- users paste `maps.app.goo.gl` or `goo.gl/maps` links
- you need the final browser-resolved URL
- you want redirect-chain artifacts for debugging or analytics

## `enriched`

`enriched` starts from the parsed or unfurled result, then optionally calls Google APIs.

Use it when:

- you need a formatted address from coordinates
- a text query should become coordinates
- directions URLs should return distance or duration
- you want a provider `place_id`

## Cost policy

`enriched` mode accepts a policy:

- `when-needed`: only call provider APIs when normalized data is still missing
- `always`: keep enrichment enabled even when the URL already provides useful data

<Tip>
  Use `when-needed` unless you have a business requirement to standardize provider-backed
  fields across every result.
</Tip>
```

### `docs/concepts/parsing-model.mdx`

```mdx
---
title: Parsing model
description: Understand the stable normalized envelope and extraction precedence.
---

## Stable envelope first

The package keeps one top-level result shape across all modes. That means your application can branch on a few stable fields:

- `status`
- `mode`
- `intent`
- `resolution.status`
- section statuses such as `location.status` and `place.status`

## Coordinate precedence

When a URL contains multiple coordinate-like patterns, the parser prefers more explicit sources first.

1. `@lat,lng`
2. `q=lat,lng`
3. `query=lat,lng`
4. `!3d...!4d...`
5. `/place/lat,lng`
6. `ll=` / `sll=`
7. numeric `destination=` and `viewpoint=`

This keeps output deterministic.

## Parsed sections

- `location`: resolved latitude/longitude with source attribution
- `place`: place-path text, formatted address, identifiers, plus code, and provider-enriched place fields
- `route`: directions metadata such as origin, destination, travel mode, and optionally duration/distance
- `query`: text searches and map actions
- `mapView`: zoom, heading, pitch, pano ID, and map center when available

## Identifier model

`featureId` and `placeId` are intentionally separate.

- `featureId` comes from the shared URL itself, usually from `ftid` or a hex-like token inside a Google Maps path.
- `placeId` comes from optional provider enrichment.

That separation matters because real shared URLs often expose `featureId` long before a public API lookup yields a `place_id`.
```

### `docs/concepts/security-model.mdx`

```mdx
---
title: Security model
description: Hostname restrictions, redirect validation, and SSRF defenses.
---

## Host allow-listing

The library only accepts known public Google Maps hosts.

It rejects:

- non-Google hosts such as `bing.com`
- suffix spoofing such as `google.com.evil`
- unsupported auth-gated share flows such as `share.google`

## Redirect safety

Every redirect hop is validated before the library follows it.

That means a short link cannot silently jump from an allowed Google domain to an arbitrary host.

## Bounded resolution

Unfurling is intentionally bounded by:

- a maximum redirect count
- per-request timeouts
- direct parsing before network work

## HTML shell handling

HTML extraction is a fallback path.

The package treats shell signals such as `APP_INITIALIZATION_STATE` as **weak evidence**, not primary truth. Stronger signals win first:

1. direct URL coordinates
2. redirect locations with coordinates
3. embedded Google Maps URLs inside the HTML shell
4. HTML coordinate heuristics

<Warning>
  The library is not designed for private or authenticated Google pages. It only targets
  public shared URLs that can be resolved safely without user cookies.
</Warning>
```

### `docs/docs.json`

```json
{
  "$schema": "https://mintlify.com/docs.json",
  "name": "@replace-me/google-maps-url-kit",
  "theme": "mint",
  "logo": {
    "light": "/logo/light.svg",
    "dark": "/logo/dark.svg"
  },
  "favicon": "/favicon.svg",
  "colors": {
    "primary": "#0f766e",
    "light": "#ccfbf1",
    "dark": "#134e4a"
  },
  "navbar": {
    "links": [
      {
        "label": "GitHub",
        "href": "https://github.com/REPLACE_ME/google-maps-url-kit"
      },
      {
        "label": "npm",
        "href": "https://www.npmjs.com/package/@replace-me/google-maps-url-kit"
      }
    ],
    "primary": {
      "type": "button",
      "label": "Quick start",
      "href": "/getting-started/quick-start"
    }
  },
  "tabs": [
    {
      "name": "Docs",
      "url": "/index"
    }
  ],
  "navigation": [
    {
      "group": "Getting Started",
      "pages": ["index", "getting-started/installation", "getting-started/quick-start"]
    },
    {
      "group": "Concepts",
      "pages": [
        "concepts/parsing-model",
        "concepts/parse-vs-unfurl-vs-enrich",
        "concepts/security-model"
      ]
    },
    {
      "group": "Guides",
      "pages": [
        "guides/parse-coordinates",
        "guides/handle-short-links",
        "guides/raw-artifacts",
        "guides/error-handling"
      ]
    },
    {
      "group": "Examples",
      "pages": ["examples/node-usage", "examples/browser-usage"]
    },
    {
      "group": "API Reference",
      "pages": ["api-reference/overview", "api-reference/errors", "api-reference/types"]
    },
    {
      "group": "Project",
      "pages": ["releases"]
    }
  ],
  "seo": {
    "metatags": {
      "og:title": "@replace-me/google-maps-url-kit",
      "og:description": "Bun-first Google Maps URL parsing, short-link unfurling, and optional enrichment for public shared URLs.",
      "twitter:card": "summary_large_image"
    }
  },
  "footer": {
    "socials": {
      "github": "https://github.com/REPLACE_ME/google-maps-url-kit"
    }
  }
}
```

### `docs/examples/browser-usage.mdx`

````mdx
---
title: Browser usage
description: Use pure parsing helpers in browser code without provider calls.
---

Pure helpers work well in browsers because they do not need Node-only APIs.

```ts
import { isGoogleMapsUrl, parseGoogleMapsUrl } from "@replace-me/google-maps-url-kit";

const userInput = window.prompt("Paste a Google Maps URL") ?? "";
if (!isGoogleMapsUrl(userInput)) {
  throw new Error("Not a supported public Google Maps URL");
}

const parsed = parseGoogleMapsUrl(userInput);
console.log(parsed.intent);
console.log(parsed.location.value);
```
````

<Warning>
Network unfurling and provider enrichment in the browser may have CORS and key-exposure implications. Prefer server-side unfurling and enrichment when practical.
</Warning>
```

### `docs/examples/node-usage.mdx`

````mdx
---
title: Node usage
description: Use the library in Bun or Node server code.
---

```ts
import {
  analyzeGoogleMapsUrl,
  parseGoogleMapsUrl,
  unfurlGoogleMapsUrl,
} from "@replace-me/google-maps-url-kit";

const parsed = parseGoogleMapsUrl("https://www.google.com/maps/@24.7136,46.6753,15z");

const unfurled = await unfurlGoogleMapsUrl("https://maps.app.goo.gl/example", {
  raw: { enabled: true },
});

const enriched = await analyzeGoogleMapsUrl(
  "https://www.google.com/maps?q=Malaz+Riyadh",
  {
    mode: "enriched",
    enrich: {
      policy: "when-needed",
      google: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
        enablePlaces: true,
      },
    },
  },
);
```
````

````

### `docs/favicon.svg`

```svg
<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="16" fill="#0F766E"/>
  <path d="M32 10C23.163 10 16 17.163 16 26C16 37.657 32 52 32 52C32 52 48 37.657 48 26C48 17.163 40.837 10 32 10Z" fill="#CCFBF1"/>
  <circle cx="32" cy="26" r="7" fill="#0F766E"/>
</svg>
````

### `docs/getting-started/installation.mdx`

````mdx
---
title: Installation
description: Install the package and set up the local development workflow.
---

## Runtime support

- Bun 1.3+
- Node.js 20.17+
- Browsers for pure parsing helpers
- Worker and edge runtimes that provide `fetch`

## Install the package

```bash
# Bun
bun add @replace-me/google-maps-url-kit

# npm
npm install @replace-me/google-maps-url-kit

# pnpm
pnpm add @replace-me/google-maps-url-kit
```
````

## Install the repo locally

```bash
bun install
```

If you are bootstrapping the repository for the first time and the lockfile is missing, create it once with:

```bash
bun install --save-text-lockfile --lockfile-only
```

## Common commands

```bash
bun run build
bun run check
bun run test
bun run docs:dev
```

<Tip>
Use `bun run check` before opening a PR. It runs format checks, linting, type checking, and tests in a deterministic order.
</Tip>
```

### `docs/getting-started/quick-start.mdx`

````mdx
---
title: Quick start
description: Parse a direct URL, unfurl a short link, and understand when to enrich.
---

## Parse a direct Google Maps URL

```ts
import { parseGoogleMapsUrl } from "@replace-me/google-maps-url-kit";

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
````

## Unfurl a short link safely

```ts
import { unfurlGoogleMapsUrl } from "@replace-me/google-maps-url-kit";

const result = await unfurlGoogleMapsUrl("https://maps.app.goo.gl/example", {
  raw: { enabled: true },
});

console.log(result.resolution.status);
console.log(result.resolution.resolvedUrl);
console.log(result.raw?.redirects?.hops);
```

## Enrich only when you need more data

```ts
import { analyzeGoogleMapsUrl } from "@replace-me/google-maps-url-kit";

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
```

<Warning>
`enriched` mode is opt-in because provider calls can cost money. Keep the default policy as `when-needed` unless you have a strong reason to force `always`.
</Warning>
```

### `docs/guides/error-handling.mdx`

````mdx
---
title: Error handling
description: Use safe envelopes or throwing variants depending on the integration boundary.
---

## Safe variants

Safe variants return the same envelope shape even on failure.

```ts
const result = parseGoogleMapsUrl("https://share.google/example");

if (result.status === "error") {
  console.error(result.error?.code, result.error?.message);
}
```
````

## Throwing variants

Throwing variants are better when invalid input should halt a request immediately.

```ts
import { unfurlGoogleMapsUrlOrThrow } from "@replace-me/google-maps-url-kit";

const result = await unfurlGoogleMapsUrlOrThrow(url);
```

## Provider denied responses

Denied provider responses are not treated like parser crashes.

Instead, enriched mode records them as:

- warning diagnostics
- `raw.providerErrors`
- preserved normalized data from the parse or unfurl stage

That means you can still use the URL-derived data even when a Google API key is restricted or a provider is disabled.

````

### `docs/guides/handle-short-links.mdx`

```mdx
---
title: Handle short links
description: Resolve `maps.app.goo.gl` and `goo.gl/maps` links safely, including dead links.
---

## Basic unfurling

```ts
import { unfurlGoogleMapsUrl } from "@replace-me/google-maps-url-kit";

const result = await unfurlGoogleMapsUrl("https://maps.app.goo.gl/example", {
  raw: { enabled: true },
});

console.log(result.resolution.status);
console.log(result.resolution.resolvedUrl);
console.log(result.raw?.redirects?.hops);
````

## Multi-hop behavior

Some short links resolve through multiple intermediate Google URLs before they become useful. The library preserves that chain when raw artifacts are enabled.

```ts
console.log(result.raw?.redirects?.hops);
// [
//   { requestUrl, responseStatus, locationHeader },
//   { requestUrl, responseStatus, locationHeader },
//   ...
// ]
```

## Dead tokens and 404 outcomes

Dead short links do not crash the parser.

Instead, you get:

- `status: "ok"`
- `resolution.status: "dead-end"`
- a warning diagnostic
- the final HTTP status when available

That keeps downstream code predictable while still surfacing failure clearly.

````

### `docs/guides/parse-coordinates.mdx`

```mdx
---
title: Parse coordinates
description: Extract coordinates, zoom, and map-view data from common Google Maps URL forms.
---

## Direct coordinate URL forms

```ts
import { parseGoogleMapsUrl } from "@replace-me/google-maps-url-kit";

const urls = [
  "https://www.google.com/maps/@24.7136,46.6753,15z",
  "https://maps.google.com/?q=24.861307,46.646618",
  "https://www.google.com/maps?ll=24.7136,46.6753",
  "https://www.google.com/maps/place/24.7136,46.6753",
  "https://www.google.com/maps/data=!3d24.7136!4d46.6753",
];

for (const url of urls) {
  const result = parseGoogleMapsUrl(url);
  console.log(result.location.value);
}
````

## Street View and map actions

```ts
const result = parseGoogleMapsUrl(
  "https://www.google.com/maps?map_action=pano&viewpoint=24.7136,46.6753&pano=test-pano",
);

console.log(result.intent); // "streetview"
console.log(result.mapView.value?.panoId); // "test-pano"
```

````

### `docs/guides/raw-artifacts.mdx`

```mdx
---
title: Raw artifacts
description: Capture raw parsing, redirect, HTML, and provider artifacts without polluting normalized output.
---

## Raw output is opt-in

Normalized output is the main API. Raw artifacts are additive.

```ts
const result = await unfurlGoogleMapsUrl(url, {
  raw: { enabled: true },
});
````

## Raw groups

The package groups raw data by stage:

- `parse`
- `redirects`
- `resolvedUrl`
- `html`
- `geocoding`
- `reverseGeocoding`
- `places`
- `directions`
- `providerErrors`

## Why raw matters

Google Maps behavior is underdocumented in practice. Raw artifacts help when you need to:

- inspect redirect chains from short links
- compare the input URL to the resolved URL
- understand why HTML fallback succeeded or failed
- preserve provider denied payloads such as `REQUEST_DENIED`

<Note>
Raw output never replaces normalized fields. It is there for debugging, auditability, and edge-case handling.
</Note>
```

### `docs/index.mdx`

````mdx
---
title: Introduction
description: Parse, normalize, unfurl, and optionally enrich public Google Maps URLs with one stable typed result envelope.
---

# @replace-me/google-maps-url-kit

`@replace-me/google-maps-url-kit` is a Bun-first TypeScript library for working with **public shared Google Maps URLs**.

It does three things well:

<CardGroup cols={3}>
  <Card title="Parse" icon="magnifying-glass" href="/concepts/parsing-model">
    Pure URL analysis with zero network calls.
  </Card>
  <Card title="Unfurl" icon="arrow-path" href="/guides/handle-short-links">
    SSRF-safe redirect following for `maps.app.goo.gl` and `goo.gl/maps`.
  </Card>
  <Card title="Enrich" icon="sparkles" href="/concepts/parse-vs-unfurl-vs-enrich">
    Optional Google API lookups with explicit cost controls.
  </Card>
</CardGroup>

## Why this package exists

Real Google Maps links are inconsistent in the wild. You will see:

- coordinate views like `@24.7136,46.6753,15z`
- dropped pins like `?q=24.7136,46.6753`
- legacy center parameters like `ll=24.7136,46.6753`
- `data=!3d...!4d...` payloads
- place pages with `ftid` identifiers
- directions and search URLs
- short links that require multiple redirects before they become useful

This package normalizes all of that into one stable top-level envelope so your app can depend on a single shape instead of a pile of regexes.

## Design principles

<Note>
  The package only targets **public shared URLs**. Private, authenticated, or unsupported
  Google share flows fail clearly instead of being guessed.
</Note>

- Early exits and typed boundaries
- Direct parsing before network work
- Strong hostname validation on every redirect hop
- Explicit source attribution for coordinates and metadata
- Raw artifacts only when you opt in

## What you get back

Every mode returns the same top-level object:

```ts
interface GoogleMapsEnvelope {
  status: "ok" | "error";
  mode: "minimal" | "unfurl" | "enriched";
  intent:
    | "coordinates"
    | "place"
    | "search"
    | "directions"
    | "map"
    | "streetview"
    | "unknown";
  input: InputMetadata;
  resolution: ResolutionMetadata;
  identifiers: {
    featureId: string | null;
    placeId: string | null;
    plusCode: PlusCode | null;
  };
  location: NormalizedSection<LocationData>;
  place: NormalizedSection<PlaceData>;
  route: NormalizedSection<RouteData>;
  query: NormalizedSection<QueryData>;
  mapView: NormalizedSection<MapViewData>;
  raw?: RawArtifacts;
}
```
````

That stable envelope is the product. Modes only change **how much work** the library is allowed to do.

## Start here

<CardGroup cols={2}>
  <Card title="Install" href="/getting-started/installation">
    Bun, npm, and pnpm setup.
  </Card>
  <Card title="Quick start" href="/getting-started/quick-start">
    Parse a direct Maps URL and unfurl a short link.
  </Card>
</CardGroup>
```

### `docs/logo/dark.svg`

```svg
<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="48" fill="#020617"/>
  <path d="M128 36C89.34 36 58 67.34 58 106C58 157 128 220 128 220C128 220 198 157 198 106C198 67.34 166.66 36 128 36Z" fill="#14B8A6"/>
  <circle cx="128" cy="106" r="30" fill="#042F2E"/>
  <path d="M96 182L160 182" stroke="#E2E8F0" stroke-width="14" stroke-linecap="round"/>
</svg>
```

### `docs/logo/light.svg`

```svg
<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="48" fill="#F8FAFC"/>
  <path d="M128 36C89.34 36 58 67.34 58 106C58 157 128 220 128 220C128 220 198 157 198 106C198 67.34 166.66 36 128 36Z" fill="#0F766E"/>
  <circle cx="128" cy="106" r="30" fill="#CCFBF1"/>
  <path d="M96 182L160 182" stroke="#0F172A" stroke-width="14" stroke-linecap="round"/>
</svg>
```

### `docs/releases.mdx`

```mdx
---
title: Releases
description: Versioning, changelog generation, and npm publishing.
---

## Release flow

1. Update the package version intentionally.
2. Commit the change with a conventional commit.
3. Push a semver tag such as `v0.1.0`.
4. The release workflow runs checks, builds docs, generates notes with `git-cliff`, creates a GitHub Release, and publishes to npm with provenance.

## Changelog strategy

This repository uses `git-cliff` rather than automatic semantic version inference.

That keeps version bumps intentional while still generating polished release notes from conventional commits.
```

### `package.json`

```json
{
  "name": "@replace-me/google-maps-url-kit",
  "version": "0.1.0",
  "description": "Bun-first TypeScript library for parsing, normalizing, unfurling, and optionally enriching public Google Maps URLs.",
  "type": "module",
  "packageManager": "bun@1.3.3",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "sideEffects": false,
  "engines": {
    "bun": ">=1.3.3",
    "node": ">=20.17.0"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/REPLACE_ME/google-maps-url-kit.git"
  },
  "bugs": {
    "url": "https://github.com/REPLACE_ME/google-maps-url-kit/issues"
  },
  "homepage": "https://github.com/REPLACE_ME/google-maps-url-kit#readme",
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "scripts": {
    "build": "bunup",
    "dev": "bunup --watch",
    "check": "bun run check:format && bun run check:lint && bun run check:types && bun run test",
    "check:format": "oxfmt --check .",
    "check:lint": "oxlint src",
    "check:types": "tsc -p tsconfig.json",
    "test": "bun test",
    "test:coverage": "bun test --coverage",
    "docs:dev": "cd docs && mint dev",
    "docs:build": "cd docs && mint validate && mint broken-links && mint a11y --skip-contrast",
    "docs:generate-api": "typedoc --options typedoc.json",
    "prepare": "husky",
    "prepublishOnly": "bun run check && bun run docs:generate-api && bun run build"
  },
  "keywords": [
    "google-maps",
    "maps",
    "url-parser",
    "url-unfurl",
    "shortlink",
    "typescript",
    "bun",
    "geocoding",
    "maps-url",
    "coordinates"
  ],
  "devDependencies": {
    "@commitlint/cli": "^19.8.1",
    "@commitlint/config-conventional": "^19.8.1",
    "@types/bun": "^1.2.21",
    "bunup": "^0.16.31",
    "git-cliff": "^2.10.0",
    "husky": "^9.1.7",
    "mint": "^4.2.108",
    "oxfmt": "^0.36.0",
    "oxlint": "^1.51.0",
    "pkg-pr-new": "^0.0.54",
    "typedoc": "^0.28.12",
    "typescript": "^5.9.3"
  },
  "license": "MIT"
}
```

### `src/__tests__/analyze.test.ts`

```ts
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
```

### `src/__tests__/fixtures.ts`

```ts
export const STABLE_COORDINATE_URLS = {
  atPattern: "https://www.google.com/maps/@24.7136,46.6753,15z",
  queryPattern: "https://maps.google.com/?q=24.861307,46.646618",
  dataPattern: "https://www.google.com/maps/place/Some+Place/data=!3d24.7136!4d46.6753",
  placePath: "https://www.google.com/maps/place/24.7136,46.6753",
  llPattern: "https://www.google.com/maps?ll=24.7136,46.6753",
} as const;

export const TEXT_URLS = {
  queryText: "https://www.google.com/maps?q=Malaz+Riyadh",
  placePathText:
    "https://www.google.com/maps/place/%D8%AD%D9%8A+%D8%A7%D9%84%D9%85%D9%84%D8%A7%D8%B2/data=!4m2!3m1!1s0x123:0x456",
  directions: "https://www.google.com/maps/dir/Riyadh/Diriyah?travelmode=driving",
  pano: "https://www.google.com/maps?map_action=pano&viewpoint=24.7136,46.6753&pano=test-pano",
} as const;

export const SHORTLINKS = {
  mapsApp: "https://maps.app.goo.gl/abc123?g_st=ic",
  gooLegacy: "https://goo.gl/maps/legacy123",
  unsupported: "https://share.google/FGT36rRoOI3ukfIad",
} as const;

export const GEOCODING_OK = {
  status: "OK",
  results: [
    {
      formatted_address: "Malaz, Riyadh Saudi Arabia",
      place_id: "place-123",
      types: ["neighborhood"],
      geometry: {
        location: { lat: 24.7136, lng: 46.6753 },
      },
      address_components: [
        { long_name: "Malaz", short_name: "Malaz", types: ["sublocality_level_1"] },
        { long_name: "Riyadh", short_name: "Riyadh", types: ["locality"] },
        { long_name: "Saudi Arabia", short_name: "SA", types: ["country"] },
      ],
      plus_code: {
        global_code: "7HVGPR8G+CM",
        compound_code: "PR8G+CM Riyadh",
      },
    },
  ],
} as const;

export const DIRECTIONS_OK = {
  status: "OK",
  routes: [
    {
      overview_polyline: { points: "encoded-polyline" },
      legs: [
        {
          distance: { value: 12000 },
          duration: { value: 900 },
        },
      ],
    },
  ],
} as const;

export const PROVIDER_DENIED = {
  status: "REQUEST_DENIED",
  error_message: "API key is invalid",
} as const;
```

### `src/__tests__/live-network.test.ts`

```ts
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
```

### `src/__tests__/parser.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import {
  canonicalizeGoogleMapsUrl,
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
```

### `src/__tests__/unfurl.test.ts`

```ts
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
```

### `src/analyze.ts`

```ts
import { GoogleMapsUrlError } from "./errors";
import { assertNever, trimToNull } from "./guards";
import { enrichGoogleMapsEnvelope } from "./enrich";
import { mergeDiagnostics } from "./normalize";
import { parseGoogleMapsUrl, parseGoogleMapsUrlOrThrow } from "./parser";
import { unfurlGoogleMapsUrl, unfurlGoogleMapsUrlOrThrow } from "./unfurl";
import type { AnalyzeOptions, Diagnostic, GoogleMapsEnvelope } from "./types";

function ensureRawPreference(
  envelope: GoogleMapsEnvelope,
  rawEnabled: boolean,
): GoogleMapsEnvelope {
  if (!rawEnabled || envelope.raw !== undefined) return envelope;
  return {
    ...envelope,
    raw: {},
  };
}

function withMode(
  envelope: GoogleMapsEnvelope,
  mode: GoogleMapsEnvelope["mode"],
): GoogleMapsEnvelope {
  if (envelope.mode === mode) return envelope;
  return {
    ...envelope,
    mode,
  };
}

function createEnrichmentDiagnostic(
  code: string,
  message: string,
  severity: Diagnostic["severity"],
  details?: string,
): Diagnostic {
  return {
    code,
    message,
    severity,
    details,
  };
}

export async function analyzeGoogleMapsUrlOrThrow(
  rawInput: string,
  options: AnalyzeOptions = {},
): Promise<GoogleMapsEnvelope> {
  const mode = options.mode ?? "minimal";
  const rawEnabled = options.raw?.enabled === true;

  switch (mode) {
    case "minimal":
      return ensureRawPreference(
        parseGoogleMapsUrlOrThrow(rawInput, options),
        rawEnabled,
      );
    case "unfurl":
      return ensureRawPreference(
        await unfurlGoogleMapsUrlOrThrow(rawInput, options),
        rawEnabled,
      );
    case "enriched": {
      const baseEnvelope = ensureRawPreference(
        await unfurlGoogleMapsUrlOrThrow(rawInput, options),
        rawEnabled,
      );

      if (baseEnvelope.status === "error") {
        return withMode(baseEnvelope, "enriched");
      }

      const googleOptions = options.enrich?.google;
      if (googleOptions === undefined) {
        return {
          ...withMode(baseEnvelope, "enriched"),
          diagnostics: mergeDiagnostics(baseEnvelope.diagnostics, [
            createEnrichmentDiagnostic(
              "enrichment_not_configured",
              "Enriched mode was requested without Google API configuration.",
              "warning",
            ),
          ]),
        };
      }

      return await enrichGoogleMapsEnvelope(
        baseEnvelope,
        googleOptions,
        options.enrich?.policy ?? "when-needed",
      );
    }
    default:
      return assertNever(mode, "Unhandled Google Maps analyze mode");
  }
}

export async function analyzeGoogleMapsUrl(
  rawInput: string,
  options: AnalyzeOptions = {},
): Promise<GoogleMapsEnvelope> {
  const mode = options.mode ?? "minimal";
  const rawEnabled = options.raw?.enabled === true;

  if (mode === "minimal") {
    return ensureRawPreference(parseGoogleMapsUrl(rawInput, options), rawEnabled);
  }

  if (mode === "unfurl") {
    return ensureRawPreference(await unfurlGoogleMapsUrl(rawInput, options), rawEnabled);
  }

  const baseEnvelope = ensureRawPreference(
    await unfurlGoogleMapsUrl(rawInput, options),
    rawEnabled,
  );
  if (baseEnvelope.status === "error") {
    return withMode(baseEnvelope, "enriched");
  }

  const googleOptions = options.enrich?.google;
  if (googleOptions === undefined) {
    return {
      ...withMode(baseEnvelope, "enriched"),
      diagnostics: mergeDiagnostics(baseEnvelope.diagnostics, [
        createEnrichmentDiagnostic(
          "enrichment_not_configured",
          "Enriched mode was requested without Google API configuration.",
          "warning",
        ),
      ]),
    };
  }

  try {
    return await enrichGoogleMapsEnvelope(
      baseEnvelope,
      googleOptions,
      options.enrich?.policy ?? "when-needed",
    );
  } catch (error) {
    const diagnostic =
      error instanceof GoogleMapsUrlError
        ? createEnrichmentDiagnostic(
            "enrichment_failed",
            error.message,
            "error",
            error.details,
          )
        : createEnrichmentDiagnostic(
            "enrichment_failed",
            "Unexpected Google Maps enrichment failure.",
            "error",
            trimToNull(rawInput) ?? undefined,
          );

    return {
      ...withMode(baseEnvelope, "enriched"),
      diagnostics: mergeDiagnostics(baseEnvelope.diagnostics, [diagnostic]),
    };
  }
}
```

### `src/domain.ts`

```ts
import { DisallowedHostnameError, UnsupportedGoogleMapsUrlError } from "./errors";

export const SHORT_LINK_DOMAINS = new Set(["goo.gl", "maps.app.goo.gl"]);

export const UNSUPPORTED_SHORTLINK_DOMAINS = new Set(["share.google"]);

const GOOGLE_HOSTNAME_PATTERN = /^(?:maps\.|www\.)?google\.[a-z]{2,}(?:\.[a-z]{2,})?$/i;

const MAPS_PATH_PATTERN = /^\/maps(?:\/|$)/;

const AT_COORDINATES_PATTERN = /@-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?(?:,|$)/;

export function isShortLinkDomain(hostname: string): boolean {
  return SHORT_LINK_DOMAINS.has(hostname.toLowerCase());
}

export function isGoogleMapsHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();

  if (isShortLinkDomain(normalizedHostname)) return true;
  if (UNSUPPORTED_SHORTLINK_DOMAINS.has(normalizedHostname)) return true;

  return GOOGLE_HOSTNAME_PATTERN.test(normalizedHostname);
}

export function isAllowedGoogleMapsDomain(hostname: string): boolean {
  return isGoogleMapsHostname(hostname);
}

export function classifyHostname(
  hostname: string,
): "standard" | "shortlink" | "unsupported-shortlink" | "disallowed" | "unknown" {
  const normalizedHostname = hostname.toLowerCase();
  if (normalizedHostname === "") return "unknown";
  if (isShortLinkDomain(normalizedHostname)) return "shortlink";
  if (UNSUPPORTED_SHORTLINK_DOMAINS.has(normalizedHostname)) {
    return "unsupported-shortlink";
  }
  if (GOOGLE_HOSTNAME_PATTERN.test(normalizedHostname)) return "standard";
  return "disallowed";
}

export function canonicalizeGoogleMapsUrl(rawUrl: string): string {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  if (!isShortLinkDomain(parsedUrl.hostname)) return rawUrl;

  if (!parsedUrl.searchParams.has("g_st")) return rawUrl;

  parsedUrl.searchParams.delete("g_st");
  return parsedUrl.toString();
}

export function isGoogleMapsUrl(rawValue: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawValue);
  } catch {
    return false;
  }

  const hostKind = classifyHostname(parsedUrl.hostname);
  if (hostKind === "shortlink" || hostKind === "unsupported-shortlink") {
    return true;
  }

  if (hostKind !== "standard") return false;

  const isMapsHost = parsedUrl.hostname.toLowerCase().startsWith("maps.");
  const hasMapPath = MAPS_PATH_PATTERN.test(parsedUrl.pathname);
  const hasAtCoordinates = AT_COORDINATES_PATTERN.test(parsedUrl.pathname);
  const hasUsefulParams =
    parsedUrl.searchParams.has("q") ||
    parsedUrl.searchParams.has("query") ||
    parsedUrl.searchParams.has("destination") ||
    parsedUrl.searchParams.has("origin") ||
    parsedUrl.searchParams.has("ll") ||
    parsedUrl.searchParams.has("sll") ||
    parsedUrl.searchParams.has("viewpoint") ||
    parsedUrl.searchParams.has("map_action");

  if (hasMapPath) return true;
  if (isMapsHost && hasAtCoordinates) return true;
  if (isMapsHost && hasUsefulParams) return true;

  return false;
}

export function assertAllowedHostname(hostname: string): void {
  const hostKind = classifyHostname(hostname);

  if (hostKind === "disallowed") {
    throw new DisallowedHostnameError(hostname);
  }

  if (hostKind === "unsupported-shortlink") {
    throw new UnsupportedGoogleMapsUrlError(
      "share.google links are recognized but unsupported for public resolution.",
      { details: hostname },
    );
  }
}
```

### `src/enrich.ts`

```ts
import { NetworkRequestError, NetworkTimeoutError } from "./errors";
import { trimToNull } from "./guards";
import { appendRawArtifacts, createSection, mergeDiagnostics } from "./normalize";
import type {
  Diagnostic,
  EnrichmentPolicy,
  FetchFunction,
  GoogleApiEnrichmentOptions,
  GoogleMapsEnvelope,
  LocationData,
  PlaceData,
  PlusCode,
  ProviderDeniedRawArtifact,
  ProviderRawArtifact,
  RouteData,
  TravelMode,
} from "./types";

const DEFAULT_PROVIDER_TIMEOUT_MS = 5000;
const DEFAULT_REGION = "us";
const DEFAULT_LANGUAGE = "en";

interface GoogleStatusBody {
  readonly status?: string;
  readonly error_message?: string;
}

interface ProviderSuccess<TBody> {
  readonly kind: "success";
  readonly requestUrl: string;
  readonly providerStatus: string | null;
  readonly body: TBody;
}

interface ProviderEmpty {
  readonly kind: "empty";
  readonly requestUrl: string;
  readonly providerStatus: string | null;
  readonly body: unknown;
}

interface ProviderDenied {
  readonly kind: "denied";
  readonly raw: ProviderDeniedRawArtifact;
}

type ProviderOutcome<TBody> = ProviderSuccess<TBody> | ProviderEmpty | ProviderDenied;

type ProviderName = ProviderDeniedRawArtifact["provider"];

interface GeocodingAddressComponent {
  readonly long_name?: string;
  readonly short_name?: string;
  readonly types?: readonly string[];
}

interface GeocodingResultBody extends GoogleStatusBody {
  readonly results?: ReadonlyArray<{
    readonly formatted_address?: string;
    readonly place_id?: string;
    readonly types?: readonly string[];
    readonly plus_code?: {
      readonly global_code?: string;
      readonly compound_code?: string;
    };
    readonly geometry?: {
      readonly location?: {
        readonly lat?: number;
        readonly lng?: number;
      };
    };
    readonly address_components?: ReadonlyArray<GeocodingAddressComponent>;
  }>;
}

interface PlacesFindResultBody extends GoogleStatusBody {
  readonly candidates?: ReadonlyArray<{
    readonly place_id?: string;
    readonly name?: string;
    readonly formatted_address?: string;
    readonly types?: readonly string[];
    readonly geometry?: {
      readonly location?: {
        readonly lat?: number;
        readonly lng?: number;
      };
    };
    readonly plus_code?: {
      readonly global_code?: string;
      readonly compound_code?: string;
    };
  }>;
}

interface DirectionsResultBody extends GoogleStatusBody {
  readonly routes?: ReadonlyArray<{
    readonly overview_polyline?: {
      readonly points?: string;
    };
    readonly legs?: ReadonlyArray<{
      readonly distance?: {
        readonly value?: number;
      };
      readonly duration?: {
        readonly value?: number;
      };
    }>;
  }>;
}

function shouldCaptureRaw(
  envelope: GoogleMapsEnvelope,
  _stage: "geocoding" | "reverse-geocoding" | "places" | "directions" | "provider-error",
): boolean {
  return envelope.raw !== undefined;
}

function createProviderRawArtifact(
  requestUrl: string,
  body: unknown,
): ProviderRawArtifact {
  const providerStatus = isObject(body) ? asString(body["status"]) : null;
  return {
    requestUrl,
    providerStatus,
    body,
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTravelMode(mode: TravelMode | null): string | null {
  if (mode === null) return null;
  if (mode === "two-wheeler") return "two_wheeler";
  return mode;
}

function plusCodeFromUnknown(value: unknown): PlusCode | null {
  if (!isObject(value)) return null;

  return {
    globalCode: asString(value["global_code"]),
    compoundCode: asString(value["compound_code"]),
  };
}

function addressComponent(
  components: ReadonlyArray<GeocodingAddressComponent> | undefined,
  types: readonly string[],
): string | null {
  if (components === undefined) return null;

  for (const desiredType of types) {
    const match = components.find((component) => component.types?.includes(desiredType));
    if (match?.long_name !== undefined) return match.long_name;
  }

  return null;
}

async function fetchJsonWithTimeout(
  fetchFn: FetchFunction,
  requestUrl: string,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(requestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    const body = await response.json();
    if (!response.ok) {
      throw new NetworkRequestError(
        `Google provider request failed with HTTP ${response.status}.`,
        {
          details: requestUrl,
        },
      );
    }

    return body;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkTimeoutError(timeoutMs);
    }
    if (error instanceof NetworkRequestError || error instanceof NetworkTimeoutError) {
      throw error;
    }
    throw new NetworkRequestError("Google provider request failed.", {
      cause: error,
      details: requestUrl,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function interpretProviderBody<TBody extends GoogleStatusBody>(args: {
  provider: ProviderName;
  requestUrl: string;
  body: TBody;
}): ProviderOutcome<TBody> {
  const providerStatus = asString(args.body.status);

  if (providerStatus === null || providerStatus === "OK") {
    return {
      kind: "success",
      requestUrl: args.requestUrl,
      providerStatus,
      body: args.body,
    };
  }

  if (providerStatus === "ZERO_RESULTS" || providerStatus === "NOT_FOUND") {
    return {
      kind: "empty",
      requestUrl: args.requestUrl,
      providerStatus,
      body: args.body,
    };
  }

  return {
    kind: "denied",
    raw: {
      provider: args.provider,
      providerStatus,
      errorMessage: asString(args.body.error_message),
      body: args.body,
    },
  };
}

async function callGoogleProvider<TBody extends GoogleStatusBody>(args: {
  provider: ProviderName;
  requestUrl: string;
  fetchFn: FetchFunction;
  timeoutMs: number;
}): Promise<ProviderOutcome<TBody>> {
  const body = await fetchJsonWithTimeout(args.fetchFn, args.requestUrl, args.timeoutMs);
  if (!isObject(body)) {
    return {
      kind: "empty",
      requestUrl: args.requestUrl,
      providerStatus: null,
      body,
    };
  }

  return interpretProviderBody({
    provider: args.provider,
    requestUrl: args.requestUrl,
    body: body as TBody,
  });
}

function shouldRunByPolicy(args: {
  currentHasValue: boolean;
  policy: EnrichmentPolicy;
  explicitlyEnabled: boolean | undefined;
  defaultWhenNeeded: boolean;
}): boolean {
  if (args.explicitlyEnabled === false) return false;
  if (args.explicitlyEnabled === true) return true;
  if (args.policy === "always") return args.defaultWhenNeeded;
  if (args.currentHasValue) return false;
  return args.defaultWhenNeeded;
}

function createProviderErrorDiagnostic(error: ProviderDeniedRawArtifact): Diagnostic {
  return {
    code: `${error.provider}_denied`,
    message: `${error.provider} returned ${error.providerStatus}.`,
    severity: "warning",
    details: error.errorMessage ?? undefined,
  };
}

function createProviderInfrastructureDiagnostic(
  provider: ProviderName,
  error: NetworkRequestError | NetworkTimeoutError,
): Diagnostic {
  return {
    code: `${provider}_request_failed`,
    message: error.message,
    severity: "error",
    details: error.details,
  };
}

function mergePlaceValue(
  current: PlaceData | null,
  patch: Partial<PlaceData>,
): PlaceData {
  return {
    title: patch.title ?? current?.title ?? null,
    formattedAddress: patch.formattedAddress ?? current?.formattedAddress ?? null,
    featureId: patch.featureId ?? current?.featureId ?? null,
    placeId: patch.placeId ?? current?.placeId ?? null,
    district: patch.district ?? current?.district ?? null,
    city: patch.city ?? current?.city ?? null,
    country: patch.country ?? current?.country ?? null,
    types: patch.types ?? current?.types ?? [],
    plusCode: patch.plusCode ?? current?.plusCode ?? null,
  };
}

function mergeRouteValue(
  current: RouteData | null,
  patch: Partial<RouteData>,
): RouteData {
  return {
    originText: patch.originText ?? current?.originText ?? null,
    destinationText: patch.destinationText ?? current?.destinationText ?? null,
    waypoints: patch.waypoints ?? current?.waypoints ?? [],
    travelMode: patch.travelMode ?? current?.travelMode ?? null,
    distanceMeters: patch.distanceMeters ?? current?.distanceMeters ?? null,
    durationSeconds: patch.durationSeconds ?? current?.durationSeconds ?? null,
    polyline: patch.polyline ?? current?.polyline ?? null,
  };
}

function createProviderLocation(
  latitude: number,
  longitude: number,
  source: LocationData["source"],
): LocationData {
  return {
    latitude,
    longitude,
    source,
    accuracy: source === "provider-geocoding" ? "approximate" : "exact",
  };
}

function locationFromGeocodingResult(
  result: NonNullable<GeocodingResultBody["results"]>[number] | undefined,
  source: LocationData["source"],
): LocationData | null {
  const latitude = asNumber(result?.geometry?.location?.lat);
  const longitude = asNumber(result?.geometry?.location?.lng);
  if (latitude === null || longitude === null) return null;

  return createProviderLocation(latitude, longitude, source);
}

async function maybeGeocodeText(
  envelope: GoogleMapsEnvelope,
  options: GoogleApiEnrichmentOptions,
  policy: EnrichmentPolicy,
): Promise<GoogleMapsEnvelope> {
  const shouldRun = shouldRunByPolicy({
    currentHasValue: envelope.location.value !== null,
    policy,
    explicitlyEnabled: options.enableGeocoding,
    defaultWhenNeeded: true,
  });
  if (!shouldRun) return envelope;

  const textToGeocode =
    trimToNull(envelope.query.value?.text) ??
    trimToNull(envelope.place.value?.title) ??
    trimToNull(envelope.place.value?.formattedAddress);
  if (textToGeocode === null) return envelope;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", textToGeocode);
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("region", options.region ?? DEFAULT_REGION);
  url.searchParams.set("language", options.language ?? DEFAULT_LANGUAGE);

  try {
    const outcome = await callGoogleProvider<GeocodingResultBody>({
      provider: "geocoding",
      requestUrl: url.toString(),
      fetchFn: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });

    if (outcome.kind === "denied") {
      return {
        ...envelope,
        diagnostics: mergeDiagnostics(envelope.diagnostics, [
          createProviderErrorDiagnostic(outcome.raw),
        ]),
        raw: appendRawArtifacts(envelope.raw, {
          providerErrors: [outcome.raw],
        }),
      };
    }

    const rawPatch = shouldCaptureRaw(envelope, "geocoding")
      ? { geocoding: createProviderRawArtifact(url.toString(), outcome.body) }
      : {};

    if (outcome.kind === "empty") {
      return {
        ...envelope,
        raw: appendRawArtifacts(envelope.raw, rawPatch),
      };
    }

    const firstResult = outcome.body.results?.[0];
    const geocodedLocation = locationFromGeocodingResult(
      firstResult,
      "provider-geocoding",
    );
    const nextLocation =
      geocodedLocation === null
        ? envelope.location
        : createSection(
            "present",
            geocodedLocation,
            [],
            [
              {
                stage: "geocoding",
                source: "google-geocoding-api",
                confidence: "medium",
              },
            ],
          );

    const nextPlace = createSection(
      "present",
      mergePlaceValue(envelope.place.value, {
        title: envelope.place.value?.title ?? textToGeocode,
        formattedAddress:
          firstResult?.formatted_address ??
          envelope.place.value?.formattedAddress ??
          null,
        placeId: firstResult?.place_id ?? envelope.place.value?.placeId ?? null,
        district: addressComponent(firstResult?.address_components, [
          "sublocality_level_1",
          "neighborhood",
          "administrative_area_level_3",
        ]),
        city: addressComponent(firstResult?.address_components, [
          "locality",
          "administrative_area_level_2",
        ]),
        country: addressComponent(firstResult?.address_components, ["country"]),
        types: firstResult?.types ?? envelope.place.value?.types ?? [],
        plusCode:
          plusCodeFromUnknown(firstResult?.plus_code) ??
          envelope.place.value?.plusCode ??
          null,
      }),
      [],
      [
        {
          stage: "geocoding",
          source: "google-geocoding-api",
          confidence: "medium",
        },
      ],
    );

    return {
      ...envelope,
      location: nextLocation,
      place: nextPlace,
      identifiers: {
        ...envelope.identifiers,
        placeId: firstResult?.place_id ?? envelope.identifiers.placeId,
        plusCode:
          plusCodeFromUnknown(firstResult?.plus_code) ?? envelope.identifiers.plusCode,
      },
      raw: appendRawArtifacts(envelope.raw, rawPatch),
    };
  } catch (error) {
    if (
      !(error instanceof NetworkRequestError) &&
      !(error instanceof NetworkTimeoutError)
    ) {
      throw error;
    }

    return {
      ...envelope,
      diagnostics: mergeDiagnostics(envelope.diagnostics, [
        createProviderInfrastructureDiagnostic("geocoding", error),
      ]),
    };
  }
}

async function maybeReverseGeocodeLocation(
  envelope: GoogleMapsEnvelope,
  options: GoogleApiEnrichmentOptions,
  policy: EnrichmentPolicy,
): Promise<GoogleMapsEnvelope> {
  const currentLocation = envelope.location.value;
  if (currentLocation === null) return envelope;

  const placeHasAddress =
    envelope.place.value?.formattedAddress !== null ||
    envelope.place.value?.city !== null ||
    envelope.place.value?.district !== null;

  const shouldRun = shouldRunByPolicy({
    currentHasValue: placeHasAddress,
    policy,
    explicitlyEnabled: options.enableReverseGeocoding,
    defaultWhenNeeded: true,
  });
  if (!shouldRun) return envelope;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set(
    "latlng",
    `${currentLocation.latitude},${currentLocation.longitude}`,
  );
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("region", options.region ?? DEFAULT_REGION);
  url.searchParams.set("language", options.language ?? DEFAULT_LANGUAGE);

  try {
    const outcome = await callGoogleProvider<GeocodingResultBody>({
      provider: "reverse-geocoding",
      requestUrl: url.toString(),
      fetchFn: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });

    if (outcome.kind === "denied") {
      return {
        ...envelope,
        diagnostics: mergeDiagnostics(envelope.diagnostics, [
          createProviderErrorDiagnostic(outcome.raw),
        ]),
        raw: appendRawArtifacts(envelope.raw, {
          providerErrors: [outcome.raw],
        }),
      };
    }

    const rawPatch = shouldCaptureRaw(envelope, "reverse-geocoding")
      ? { reverseGeocoding: createProviderRawArtifact(url.toString(), outcome.body) }
      : {};

    if (outcome.kind === "empty") {
      return {
        ...envelope,
        raw: appendRawArtifacts(envelope.raw, rawPatch),
      };
    }

    const firstResult = outcome.body.results?.[0];
    const nextPlace = createSection(
      "present",
      mergePlaceValue(envelope.place.value, {
        formattedAddress:
          firstResult?.formatted_address ??
          envelope.place.value?.formattedAddress ??
          null,
        placeId: firstResult?.place_id ?? envelope.place.value?.placeId ?? null,
        district: addressComponent(firstResult?.address_components, [
          "sublocality_level_1",
          "administrative_area_level_3",
          "neighborhood",
        ]),
        city: addressComponent(firstResult?.address_components, [
          "locality",
          "administrative_area_level_2",
        ]),
        country: addressComponent(firstResult?.address_components, ["country"]),
        types: firstResult?.types ?? envelope.place.value?.types ?? [],
        plusCode:
          plusCodeFromUnknown(firstResult?.plus_code) ??
          envelope.place.value?.plusCode ??
          null,
      }),
      [],
      [
        {
          stage: "reverse-geocoding",
          source: "google-geocoding-api",
          confidence: "high",
        },
      ],
    );

    return {
      ...envelope,
      place: nextPlace,
      identifiers: {
        ...envelope.identifiers,
        placeId: firstResult?.place_id ?? envelope.identifiers.placeId,
        plusCode:
          plusCodeFromUnknown(firstResult?.plus_code) ?? envelope.identifiers.plusCode,
      },
      raw: appendRawArtifacts(envelope.raw, rawPatch),
    };
  } catch (error) {
    if (
      !(error instanceof NetworkRequestError) &&
      !(error instanceof NetworkTimeoutError)
    ) {
      throw error;
    }

    return {
      ...envelope,
      diagnostics: mergeDiagnostics(envelope.diagnostics, [
        createProviderInfrastructureDiagnostic("reverse-geocoding", error),
      ]),
    };
  }
}

async function maybeFindPlace(
  envelope: GoogleMapsEnvelope,
  options: GoogleApiEnrichmentOptions,
  policy: EnrichmentPolicy,
): Promise<GoogleMapsEnvelope> {
  const shouldRun = shouldRunByPolicy({
    currentHasValue: envelope.identifiers.placeId !== null,
    policy,
    explicitlyEnabled: options.enablePlaces,
    defaultWhenNeeded: false,
  });
  if (!shouldRun) return envelope;

  const inputText =
    trimToNull(envelope.place.value?.title) ??
    trimToNull(envelope.query.value?.text) ??
    trimToNull(envelope.place.value?.formattedAddress);
  if (inputText === null) return envelope;

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
  );
  url.searchParams.set("input", inputText);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set(
    "fields",
    "place_id,name,formatted_address,types,geometry,plus_code",
  );
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("language", options.language ?? DEFAULT_LANGUAGE);

  try {
    const outcome = await callGoogleProvider<PlacesFindResultBody>({
      provider: "places",
      requestUrl: url.toString(),
      fetchFn: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });

    if (outcome.kind === "denied") {
      return {
        ...envelope,
        diagnostics: mergeDiagnostics(envelope.diagnostics, [
          createProviderErrorDiagnostic(outcome.raw),
        ]),
        raw: appendRawArtifacts(envelope.raw, {
          providerErrors: [outcome.raw],
        }),
      };
    }

    const rawPatch = shouldCaptureRaw(envelope, "places")
      ? { places: createProviderRawArtifact(url.toString(), outcome.body) }
      : {};

    if (outcome.kind === "empty") {
      return {
        ...envelope,
        raw: appendRawArtifacts(envelope.raw, rawPatch),
      };
    }

    const candidate = outcome.body.candidates?.[0];
    const nextLocation = (() => {
      if (envelope.location.value !== null) return envelope.location;

      const latitude = asNumber(candidate?.geometry?.location?.lat);
      const longitude = asNumber(candidate?.geometry?.location?.lng);
      if (latitude === null || longitude === null) return envelope.location;

      return createSection(
        "present",
        createProviderLocation(latitude, longitude, "provider-places"),
        [],
        [
          {
            stage: "places",
            source: "google-places-api",
            confidence: "medium",
          },
        ],
      );
    })();

    const nextPlace = createSection(
      "present",
      mergePlaceValue(envelope.place.value, {
        title: candidate?.name ?? envelope.place.value?.title ?? inputText,
        formattedAddress:
          candidate?.formatted_address ?? envelope.place.value?.formattedAddress ?? null,
        placeId: candidate?.place_id ?? envelope.place.value?.placeId ?? null,
        types: candidate?.types ?? envelope.place.value?.types ?? [],
        plusCode:
          plusCodeFromUnknown(candidate?.plus_code) ??
          envelope.place.value?.plusCode ??
          null,
      }),
      [],
      [
        {
          stage: "places",
          source: "google-places-api",
          confidence: "medium",
        },
      ],
    );

    return {
      ...envelope,
      location: nextLocation,
      place: nextPlace,
      identifiers: {
        ...envelope.identifiers,
        placeId: candidate?.place_id ?? envelope.identifiers.placeId,
        plusCode:
          plusCodeFromUnknown(candidate?.plus_code) ?? envelope.identifiers.plusCode,
      },
      raw: appendRawArtifacts(envelope.raw, rawPatch),
    };
  } catch (error) {
    if (
      !(error instanceof NetworkRequestError) &&
      !(error instanceof NetworkTimeoutError)
    ) {
      throw error;
    }

    return {
      ...envelope,
      diagnostics: mergeDiagnostics(envelope.diagnostics, [
        createProviderInfrastructureDiagnostic("places", error),
      ]),
    };
  }
}

async function maybeDirections(
  envelope: GoogleMapsEnvelope,
  options: GoogleApiEnrichmentOptions,
  policy: EnrichmentPolicy,
): Promise<GoogleMapsEnvelope> {
  const route = envelope.route.value;
  if (route === null) return envelope;
  if (route.originText === null || route.destinationText === null) return envelope;

  const shouldRun = shouldRunByPolicy({
    currentHasValue: route.distanceMeters !== null || route.durationSeconds !== null,
    policy,
    explicitlyEnabled: options.enableDirections,
    defaultWhenNeeded: false,
  });
  if (!shouldRun) return envelope;

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", route.originText);
  url.searchParams.set("destination", route.destinationText);
  if (route.waypoints.length > 0) {
    url.searchParams.set("waypoints", route.waypoints.join("|"));
  }
  const normalizedMode = normalizeTravelMode(route.travelMode);
  if (normalizedMode !== null) {
    url.searchParams.set("mode", normalizedMode);
  }
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("language", options.language ?? DEFAULT_LANGUAGE);

  try {
    const outcome = await callGoogleProvider<DirectionsResultBody>({
      provider: "directions",
      requestUrl: url.toString(),
      fetchFn: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    });

    if (outcome.kind === "denied") {
      return {
        ...envelope,
        diagnostics: mergeDiagnostics(envelope.diagnostics, [
          createProviderErrorDiagnostic(outcome.raw),
        ]),
        raw: appendRawArtifacts(envelope.raw, {
          providerErrors: [outcome.raw],
        }),
      };
    }

    const rawPatch = shouldCaptureRaw(envelope, "directions")
      ? { directions: createProviderRawArtifact(url.toString(), outcome.body) }
      : {};

    if (outcome.kind === "empty") {
      return {
        ...envelope,
        raw: appendRawArtifacts(envelope.raw, rawPatch),
      };
    }

    const leg = outcome.body.routes?.[0]?.legs?.[0];
    const nextRoute = createSection(
      "present",
      mergeRouteValue(envelope.route.value, {
        distanceMeters: asNumber(leg?.distance?.value),
        durationSeconds: asNumber(leg?.duration?.value),
        polyline: asString(outcome.body.routes?.[0]?.overview_polyline?.points),
      }),
      [],
      [
        {
          stage: "directions",
          source: "google-directions-api",
          confidence: "medium",
        },
      ],
    );

    return {
      ...envelope,
      route: nextRoute,
      raw: appendRawArtifacts(envelope.raw, rawPatch),
    };
  } catch (error) {
    if (
      !(error instanceof NetworkRequestError) &&
      !(error instanceof NetworkTimeoutError)
    ) {
      throw error;
    }

    return {
      ...envelope,
      diagnostics: mergeDiagnostics(envelope.diagnostics, [
        createProviderInfrastructureDiagnostic("directions", error),
      ]),
    };
  }
}

export async function enrichGoogleMapsEnvelope(
  envelope: GoogleMapsEnvelope,
  options: GoogleApiEnrichmentOptions,
  policy: EnrichmentPolicy = "when-needed",
): Promise<GoogleMapsEnvelope> {
  if (envelope.status === "error") return { ...envelope, mode: "enriched" };

  let enriched: GoogleMapsEnvelope = { ...envelope, mode: "enriched" };
  enriched = await maybeGeocodeText(enriched, options, policy);
  enriched = await maybeReverseGeocodeLocation(enriched, options, policy);
  enriched = await maybeFindPlace(enriched, options, policy);
  enriched = await maybeDirections(enriched, options, policy);
  return enriched;
}
```

### `src/errors.ts`

```ts
export type GoogleMapsUrlErrorCode =
  | "empty_input"
  | "invalid_url"
  | "disallowed_hostname"
  | "unsupported_url"
  | "redirect_limit"
  | "network_timeout"
  | "network_error"
  | "provider_error";

interface ErrorInit {
  readonly details?: string | undefined;
  readonly cause?: unknown;
}

export class GoogleMapsUrlError extends Error {
  readonly code: GoogleMapsUrlErrorCode;
  readonly details?: string | undefined;

  constructor(code: GoogleMapsUrlErrorCode, message: string, init?: ErrorInit) {
    super(message, init?.cause === undefined ? undefined : { cause: init.cause });
    this.name = "GoogleMapsUrlError";
    this.code = code;
    this.details = init?.details;
  }
}

export class InvalidGoogleMapsUrlError extends GoogleMapsUrlError {
  constructor(message: string, init?: ErrorInit) {
    super("invalid_url", message, init);
    this.name = "InvalidGoogleMapsUrlError";
  }
}

export class EmptyInputError extends GoogleMapsUrlError {
  constructor() {
    super("empty_input", "Input must be a non-empty string.");
    this.name = "EmptyInputError";
  }
}

export class DisallowedHostnameError extends GoogleMapsUrlError {
  readonly hostname: string;

  constructor(hostname: string) {
    super("disallowed_hostname", "Hostname is not an allowed Google Maps host.", {
      details: hostname,
    });
    this.name = "DisallowedHostnameError";
    this.hostname = hostname;
  }
}

export class UnsupportedGoogleMapsUrlError extends GoogleMapsUrlError {
  constructor(message: string, init?: ErrorInit) {
    super("unsupported_url", message, init);
    this.name = "UnsupportedGoogleMapsUrlError";
  }
}

export class RedirectLimitError extends GoogleMapsUrlError {
  readonly maxRedirects: number;

  constructor(maxRedirects: number) {
    super(
      "redirect_limit",
      `Redirect chain exceeded the configured maximum of ${maxRedirects}.`,
      { details: String(maxRedirects) },
    );
    this.name = "RedirectLimitError";
    this.maxRedirects = maxRedirects;
  }
}

export class NetworkTimeoutError extends GoogleMapsUrlError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super("network_timeout", `Network request timed out after ${timeoutMs}ms.`, {
      details: String(timeoutMs),
    });
    this.name = "NetworkTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class NetworkRequestError extends GoogleMapsUrlError {
  constructor(message: string, init?: ErrorInit) {
    super("network_error", message, init);
    this.name = "NetworkRequestError";
  }
}

export class GoogleProviderError extends GoogleMapsUrlError {
  readonly provider: "geocoding" | "reverse-geocoding" | "places" | "directions";
  readonly providerStatus: string | null;

  constructor(
    provider: "geocoding" | "reverse-geocoding" | "places" | "directions",
    providerStatus: string | null,
    message: string,
    init?: ErrorInit,
  ) {
    super("provider_error", message, init);
    this.name = "GoogleProviderError";
    this.provider = provider;
    this.providerStatus = providerStatus;
  }
}
```

### `src/guards.ts`

```ts
export function assertNever(value: never, message: string): never {
  throw new Error(`${message}: ${String(value)}`);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  return trimmed;
}

export function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function parseFiniteNumber(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;

  return parsed;
}
```

### `src/html-extract.ts`

```ts
import { isAllowedGoogleMapsDomain } from "./domain";
import { parseFiniteNumber, safeDecodeURIComponent } from "./guards";
import { extractCoordsFromUrl } from "./parser";
import type {
  CoordinateSource,
  Coordinates,
  HtmlArtifactsRaw,
  HtmlObservationRaw,
  LocationData,
} from "./types";

interface CoordinateMatch {
  readonly coordinates: Coordinates;
  readonly source: CoordinateSource;
}

export interface HtmlExtractionResult {
  readonly location: LocationData | null;
  readonly candidateUrls: readonly string[];
  readonly geocodeCandidateUrl: string | null;
  readonly artifacts: HtmlArtifactsRaw;
}

const EMBEDDED_GOOGLE_MAPS_URL_PATTERN =
  /https:\/\/(?:(?:www\.)?google\.[a-z.]+\/maps[^"'<>\s]*|maps\.google\.[a-z.]+\/[^"'<>\s]*|goo\.gl\/maps\/[^"'<>\s]*|maps\.app\.goo\.gl\/[^"'<>\s]*)/gi;

const JSON_LD_LATITUDE_PATTERN = /"latitude"\s*:\s*(-?\d+(?:\.\d+)?)/;
const JSON_LD_LONGITUDE_PATTERN = /"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/;
const GEO_INTENT_PATTERN = /geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const DATA_PARAM_PATTERN = /!3d(-?\d+(?:\.\d+)?).*!4d(-?\d+(?:\.\d+)?)/;
const APP_STATE_PATTERN = /\[null,null,(-?\d+\.\d{3,}),(-?\d+\.\d{3,})\]/;
const CENTER_PATTERN = /center['":;\s]*\[?\s*(-?\d+\.\d{3,})\s*[,\]]\s*(-?\d+\.\d{3,})/;
const META_LATITUDE_PATTERN =
  /(?:latitude|place:location:latitude)['"]\s*(?:content|value)=['"]\s*(-?\d+(?:\.\d+)?)/i;
const META_LONGITUDE_PATTERN =
  /(?:longitude|place:location:longitude)['"]\s*(?:content|value)=['"]\s*(-?\d+(?:\.\d+)?)/i;

function isValidCoordinate(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}

function toCoordinateMatch(
  latitude: number,
  longitude: number,
  source: CoordinateSource,
): CoordinateMatch | null {
  if (!isValidCoordinate(latitude, longitude)) return null;

  return {
    coordinates: { latitude, longitude },
    source,
  };
}

function fromMatch(
  match: RegExpMatchArray | null,
  source: CoordinateSource,
): CoordinateMatch | null {
  const latitude = parseFiniteNumber(match?.[1]);
  const longitude = parseFiniteNumber(match?.[2]);
  if (latitude === null || longitude === null) return null;

  return toCoordinateMatch(latitude, longitude, source);
}

function createLocationData(match: CoordinateMatch): LocationData {
  return {
    latitude: match.coordinates.latitude,
    longitude: match.coordinates.longitude,
    source: match.source,
    accuracy: match.source === "html-app-initialization-state" ? "approximate" : "exact",
  };
}

function normalizeHtmlUrl(rawValue: string): string | null {
  const decodedValue = rawValue.replaceAll("&amp;", "&").trim();
  if (decodedValue === "") return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(decodedValue);
  } catch {
    return null;
  }

  if (!isAllowedGoogleMapsDomain(parsedUrl.hostname)) return null;
  return parsedUrl.toString();
}

export function extractEmbeddedGoogleMapsUrls(html: string): readonly string[] {
  const matches = html.match(EMBEDDED_GOOGLE_MAPS_URL_PATTERN) ?? [];
  const normalizedUrls: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const normalizedUrl = normalizeHtmlUrl(match);
    if (normalizedUrl === null) continue;
    if (seen.has(normalizedUrl)) continue;

    seen.add(normalizedUrl);
    normalizedUrls.push(normalizedUrl);
  }

  return normalizedUrls;
}

export function extractDesktopHandoffUrl(html: string): string | null {
  const match = html.match(/data-desktop-link=(?:"([^"]+)"|'([^']+)')/i);
  const rawValue = (match?.[1] ?? match?.[2] ?? "").trim();
  if (rawValue === "") return null;

  return normalizeHtmlUrl(rawValue);
}

function extractMetaRefreshUrl(html: string): string | null {
  const match = html.match(
    /http-equiv=(?:"|')refresh(?:"|')[^>]*content=(?:"|')[^"']*url=([^"']+)(?:"|')/i,
  );
  const rawValue = (match?.[1] ?? "").trim();
  if (rawValue === "") return null;

  return normalizeHtmlUrl(rawValue);
}

function extractJsonLdCoords(html: string): CoordinateMatch | null {
  const latitude = parseFiniteNumber(html.match(JSON_LD_LATITUDE_PATTERN)?.[1]);
  const longitude = parseFiniteNumber(html.match(JSON_LD_LONGITUDE_PATTERN)?.[1]);
  if (latitude === null || longitude === null) return null;

  return toCoordinateMatch(latitude, longitude, "html-json-ld");
}

function extractGeoIntentCoords(html: string): CoordinateMatch | null {
  return fromMatch(html.match(GEO_INTENT_PATTERN), "html-geo-intent");
}

function extractDataParamCoords(html: string): CoordinateMatch | null {
  return fromMatch(html.match(DATA_PARAM_PATTERN), "html-data-param");
}

function extractMetaTagCoords(html: string): CoordinateMatch | null {
  const latitude = parseFiniteNumber(html.match(META_LATITUDE_PATTERN)?.[1]);
  const longitude = parseFiniteNumber(html.match(META_LONGITUDE_PATTERN)?.[1]);
  if (latitude === null || longitude === null) return null;

  return toCoordinateMatch(latitude, longitude, "html-center-pattern");
}

function extractAppStateCoords(html: string): CoordinateMatch | null {
  return fromMatch(html.match(APP_STATE_PATTERN), "html-app-state");
}

function extractCenterCoords(html: string): CoordinateMatch | null {
  return fromMatch(html.match(CENTER_PATTERN), "html-center-pattern");
}

function extractAppInitializationStateCoords(html: string): CoordinateMatch | null {
  const markerIndex = html.indexOf("APP_INITIALIZATION_STATE");
  if (markerIndex === -1) return null;

  const markerWindow = html.slice(markerIndex, markerIndex + 1500);
  const pairMatch = markerWindow.match(/(-?\d+\.\d{3,})\s*,\s*(-?\d+\.\d{3,})/);
  return fromMatch(pairMatch, "html-app-initialization-state");
}

export function extractCoordsFromHtml(html: string): CoordinateMatch | null {
  return (
    extractJsonLdCoords(html) ??
    extractGeoIntentCoords(html) ??
    extractDataParamCoords(html) ??
    extractMetaTagCoords(html) ??
    extractAppStateCoords(html) ??
    extractCenterCoords(html) ??
    extractAppInitializationStateCoords(html)
  );
}

function buildHtmlObservations(
  html: string,
  candidateUrls: readonly string[],
): readonly HtmlObservationRaw[] {
  const observations: HtmlObservationRaw[] = [];

  if (candidateUrls.length > 0) {
    observations.push({
      kind: "embedded-google-maps-urls",
      value: String(candidateUrls.length),
    });
  }

  if (html.includes("APP_INITIALIZATION_STATE")) {
    observations.push({
      kind: "app-initialization-state-present",
      value: "true",
    });
  }

  if (/data-desktop-link=/i.test(html)) {
    observations.push({
      kind: "desktop-handoff-present",
      value: "true",
    });
  }

  if (/http-equiv=(?:"|')refresh(?:"|')/i.test(html)) {
    observations.push({
      kind: "meta-refresh-present",
      value: "true",
    });
  }

  return observations;
}

export function extractHtmlSignals(html: string): HtmlExtractionResult {
  const embeddedUrls = extractEmbeddedGoogleMapsUrls(html);
  const desktopHandoffUrl = extractDesktopHandoffUrl(html);
  const metaRefreshUrl = extractMetaRefreshUrl(html);

  const orderedCandidates: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [desktopHandoffUrl, metaRefreshUrl, ...embeddedUrls]) {
    if (candidate === null) continue;
    if (seen.has(candidate)) continue;

    seen.add(candidate);
    orderedCandidates.push(candidate);
  }

  for (const candidate of orderedCandidates) {
    const urlMatch = extractCoordsFromUrl(candidate);
    if (urlMatch === null) continue;

    return {
      location: createLocationData(urlMatch),
      candidateUrls: orderedCandidates,
      geocodeCandidateUrl: candidate,
      artifacts: {
        extractedUrls: orderedCandidates,
        observations: buildHtmlObservations(html, orderedCandidates),
      },
    };
  }

  const htmlMatch = extractCoordsFromHtml(html);
  if (htmlMatch !== null) {
    return {
      location: createLocationData(htmlMatch),
      candidateUrls: orderedCandidates,
      geocodeCandidateUrl: orderedCandidates[0] ?? null,
      artifacts: {
        extractedUrls: orderedCandidates,
        observations: buildHtmlObservations(html, orderedCandidates),
      },
    };
  }

  return {
    location: null,
    candidateUrls: orderedCandidates,
    geocodeCandidateUrl: orderedCandidates[0] ?? null,
    artifacts: {
      extractedUrls: orderedCandidates,
      observations: buildHtmlObservations(html, orderedCandidates),
    },
  };
}
```

### `src/index.ts`

```ts
export type {
  AddressComponent,
  AnalyzeOptions,
  Confidence,
  CoordinateSource,
  Coordinates,
  Diagnostic,
  EnrichmentPolicy,
  ErrorSummary,
  FetchFunction,
  GoogleApiEnrichmentOptions,
  GoogleMapsEnvelope,
  GoogleMapsIntent,
  GoogleMapsMode,
  HostKind,
  HtmlArtifactsRaw,
  HtmlObservationRaw,
  InputMetadata,
  LocationData,
  MapAction,
  MapViewData,
  ParseArtifactsRaw,
  ParseOptions,
  PlaceData,
  PlusCode,
  ProviderDeniedRawArtifact,
  ProviderRawArtifact,
  QueryData,
  QueryTextSource,
  RawArtifacts,
  RawCaptureOptions,
  RawStage,
  RedirectHopRaw,
  ResolvedGoogleMapsUrl,
  ResolutionArtifactsRaw,
  ResolutionMetadata,
  ResolutionStatus,
  ResultStatus,
  RouteData,
  SectionStatus,
  TravelMode,
  UnfurlOptions,
} from "./types";

export {
  EmptyInputError,
  DisallowedHostnameError,
  GoogleMapsUrlError,
  GoogleProviderError,
  InvalidGoogleMapsUrlError,
  NetworkRequestError,
  NetworkTimeoutError,
  RedirectLimitError,
  UnsupportedGoogleMapsUrlError,
} from "./errors";

export {
  assertAllowedHostname,
  canonicalizeGoogleMapsUrl,
  classifyHostname,
  isAllowedGoogleMapsDomain,
  isGoogleMapsHostname,
  isGoogleMapsUrl,
  isShortLinkDomain,
  SHORT_LINK_DOMAINS,
  UNSUPPORTED_SHORTLINK_DOMAINS,
} from "./domain";

export {
  extractCoordsFromHtml,
  extractDesktopHandoffUrl,
  extractEmbeddedGoogleMapsUrls,
  extractHtmlSignals,
} from "./html-extract";

export {
  extractCoordsFromUrl,
  extractFeatureId,
  extractGeocodeText,
  extractQueryText,
  parseGoogleMapsUrl,
  parseGoogleMapsUrlOrThrow,
} from "./parser";

export {
  resolveGoogleMapsUrl,
  resolveGoogleMapsUrlOrThrow,
  unfurlGoogleMapsUrl,
  unfurlGoogleMapsUrlOrThrow,
} from "./unfurl";

export { enrichGoogleMapsEnvelope } from "./enrich";

export { analyzeGoogleMapsUrl, analyzeGoogleMapsUrlOrThrow } from "./analyze";
```

### `src/normalize.ts`

```ts
import type {
  Diagnostic,
  ErrorSummary,
  GoogleMapsEnvelope,
  GoogleMapsIntent,
  GoogleMapsMode,
  HostKind,
  InputMetadata,
  LocationData,
  MapViewData,
  NormalizedSection,
  ParseArtifactsRaw,
  PlaceData,
  PlusCode,
  QueryData,
  RawArtifacts,
  ResolutionMetadata,
  RouteData,
  SectionStatus,
} from "./types";

export function createSection<TValue>(
  status: SectionStatus,
  value: TValue | null,
  diagnostics: readonly Diagnostic[] = [],
  provenance: NormalizedSection<TValue>["provenance"] = [],
): NormalizedSection<TValue> {
  return {
    status,
    value,
    diagnostics,
    provenance,
  };
}

export function absentSection<TValue>(): NormalizedSection<TValue> {
  return createSection<TValue>("absent", null);
}

export function notRequestedSection<TValue>(): NormalizedSection<TValue> {
  return createSection<TValue>("not-requested", null);
}

export function createErrorSummary(code: string, message: string): ErrorSummary {
  return { code, message };
}

export function mergeDiagnostics(
  ...diagnosticSets: ReadonlyArray<readonly Diagnostic[]>
): readonly Diagnostic[] {
  const seen = new Set<string>();
  const merged: Diagnostic[] = [];

  for (const diagnosticSet of diagnosticSets) {
    for (const diagnostic of diagnosticSet) {
      const key = `${diagnostic.code}:${diagnostic.message}:${diagnostic.severity}`;
      if (seen.has(key)) continue;

      seen.add(key);
      merged.push(diagnostic);
    }
  }

  return merged;
}

export function createInputMetadata(args: {
  raw: string;
  normalized: string;
  hostname: string | null;
  hostKind: HostKind;
  isGoogleMapsUrl: boolean;
  isShortLink: boolean;
  canonicalized: string | null;
}): InputMetadata {
  return {
    raw: args.raw,
    normalized: args.normalized,
    hostname: args.hostname,
    hostKind: args.hostKind,
    isGoogleMapsUrl: args.isGoogleMapsUrl,
    isShortLink: args.isShortLink,
    canonicalized: args.canonicalized,
  };
}

export function createResolutionMetadata(args: {
  status: ResolutionMetadata["status"];
  resolvedUrl?: string | null;
  redirectCount?: number;
  finalHttpStatus?: number | null;
  usedHtmlFallback?: boolean;
}): ResolutionMetadata {
  return {
    status: args.status,
    resolvedUrl: args.resolvedUrl ?? null,
    redirectCount: args.redirectCount ?? 0,
    finalHttpStatus: args.finalHttpStatus ?? null,
    usedHtmlFallback: args.usedHtmlFallback ?? false,
  };
}

export function appendRawArtifacts(
  current: RawArtifacts | undefined,
  patch: Partial<RawArtifacts>,
): RawArtifacts | undefined {
  if (
    patch.parse === undefined &&
    patch.redirects === undefined &&
    patch.resolvedUrl === undefined &&
    patch.html === undefined &&
    patch.geocoding === undefined &&
    patch.reverseGeocoding === undefined &&
    patch.places === undefined &&
    patch.directions === undefined &&
    patch.providerErrors === undefined
  ) {
    return current;
  }

  return {
    ...current,
    ...patch,
    providerErrors:
      patch.providerErrors === undefined
        ? current?.providerErrors
        : [...(current?.providerErrors ?? []), ...patch.providerErrors],
  };
}

export function createEnvelope(args: {
  mode: GoogleMapsMode;
  intent: GoogleMapsIntent;
  input: InputMetadata;
  resolution: ResolutionMetadata;
  diagnostics?: readonly Diagnostic[];
  error?: ErrorSummary | null;
  identifiers?: {
    featureId?: string | null;
    placeId?: string | null;
    plusCode?: PlusCode | null;
  };
  location?: NormalizedSection<LocationData>;
  place?: NormalizedSection<PlaceData>;
  route?: NormalizedSection<RouteData>;
  query?: NormalizedSection<QueryData>;
  mapView?: NormalizedSection<MapViewData>;
  raw?: RawArtifacts;
}): GoogleMapsEnvelope {
  return {
    status: args.error ? "error" : "ok",
    mode: args.mode,
    intent: args.intent,
    diagnostics: args.diagnostics ?? [],
    error: args.error ?? null,
    input: args.input,
    resolution: args.resolution,
    identifiers: {
      featureId: args.identifiers?.featureId ?? null,
      placeId: args.identifiers?.placeId ?? null,
      plusCode: args.identifiers?.plusCode ?? null,
    },
    location: args.location ?? absentSection<LocationData>(),
    place: args.place ?? absentSection<PlaceData>(),
    route: args.route ?? absentSection<RouteData>(),
    query: args.query ?? absentSection<QueryData>(),
    mapView: args.mapView ?? absentSection<MapViewData>(),
    raw: args.raw,
  };
}

export function withTopLevelError(
  envelope: GoogleMapsEnvelope,
  error: ErrorSummary,
  diagnostics: readonly Diagnostic[] = [],
  raw?: RawArtifacts,
): GoogleMapsEnvelope {
  return {
    ...envelope,
    status: "error",
    error,
    diagnostics: mergeDiagnostics(envelope.diagnostics, diagnostics),
    raw: appendRawArtifacts(envelope.raw, raw ?? {}),
  };
}

export function withRawParseArtifacts(
  envelope: GoogleMapsEnvelope,
  parseArtifacts: ParseArtifactsRaw | undefined,
): GoogleMapsEnvelope {
  if (parseArtifacts === undefined) return envelope;

  return {
    ...envelope,
    raw: appendRawArtifacts(envelope.raw, { parse: parseArtifacts }),
  };
}
```

### `src/parser.ts`

```ts
import {
  DisallowedHostnameError,
  EmptyInputError,
  InvalidGoogleMapsUrlError,
  UnsupportedGoogleMapsUrlError,
} from "./errors";
import {
  canonicalizeGoogleMapsUrl,
  classifyHostname,
  isGoogleMapsUrl,
  isShortLinkDomain,
} from "./domain";
import { parseFiniteNumber, safeDecodeURIComponent, trimToNull } from "./guards";
import {
  absentSection,
  createEnvelope,
  createErrorSummary,
  createInputMetadata,
  createResolutionMetadata,
  createSection,
  withRawParseArtifacts,
} from "./normalize";
import type {
  CoordinateSource,
  Coordinates,
  GoogleMapsEnvelope,
  GoogleMapsIntent,
  LocationData,
  MapAction,
  MapViewData,
  ParseArtifactsRaw,
  ParseOptions,
  PlaceData,
  PlusCode,
  QueryData,
  QueryTextSource,
  RouteData,
  TravelMode,
} from "./types";

interface CoordinateMatch {
  readonly coordinates: Coordinates;
  readonly source: CoordinateSource;
}

const AT_PATTERN = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?z?/;
const DATA_PATTERN = /!3d(-?\d+(?:\.\d+)?).*!4d(-?\d+(?:\.\d+)?)/;
const PLACE_COORDS_PATTERN = /\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const FTID_PATTERN = /0x[0-9a-fA-F]+:0x[0-9a-fA-F]+/;
const NUMERIC_COORDS_PATTERN = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;
const PLUS_CODE_PATTERN = /([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})/i;

function safeParseUrl(rawValue: string): URL | null {
  try {
    return new URL(rawValue);
  } catch {
    return null;
  }
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}

function fromMatch(
  match: RegExpMatchArray | null,
  source: CoordinateSource,
): CoordinateMatch | null {
  if (match?.[1] === undefined || match[2] === undefined) return null;

  const latitude = Number.parseFloat(match[1]);
  const longitude = Number.parseFloat(match[2]);
  if (!isValidCoordinate(latitude, longitude)) return null;

  return {
    coordinates: { latitude, longitude },
    source,
  };
}

function coordsFromParamValue(
  value: string | null,
  source: CoordinateSource,
): CoordinateMatch | null {
  if (value === null) return null;

  const match = value.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  return fromMatch(match, source);
}

function createLocationData(match: CoordinateMatch): LocationData {
  return {
    latitude: match.coordinates.latitude,
    longitude: match.coordinates.longitude,
    source: match.source,
    accuracy: "exact",
  };
}

function decodeHumanText(rawValue: string): string | null {
  const decoded = safeDecodeURIComponent(rawValue);
  if (decoded === null) return null;

  const normalized = decoded.replace(/\+/g, " ").trim();
  if (normalized === "") return null;

  return normalized;
}

function extractPlacePathText(parsedUrl: URL): string | null {
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const placeIndex = segments.findIndex((segment) => segment.toLowerCase() === "place");
  if (placeIndex === -1) return null;

  const rawSegment = segments[placeIndex + 1];
  if (rawSegment === undefined) return null;
  if (rawSegment.toLowerCase().startsWith("data=!")) return null;

  const decoded = decodeHumanText(rawSegment);
  if (decoded === null) return null;
  if (NUMERIC_COORDS_PATTERN.test(decoded)) return null;

  return decoded;
}

function extractSearchTextFromParam(
  parsedUrl: URL,
  paramName: "q" | "query",
  source: QueryTextSource,
): QueryData | null {
  const rawValue = trimToNull(parsedUrl.searchParams.get(paramName));
  if (rawValue === null) return null;

  const isCoordinateQuery = NUMERIC_COORDS_PATTERN.test(rawValue);
  return {
    text: isCoordinateQuery ? null : rawValue,
    source,
    isCoordinateQuery,
    mapAction: extractMapAction(parsedUrl),
  };
}

function extractTravelMode(parsedUrl: URL): TravelMode | null {
  const rawMode = trimToNull(parsedUrl.searchParams.get("travelmode"));
  if (rawMode === null) return null;

  switch (rawMode.toLowerCase()) {
    case "driving":
    case "walking":
    case "bicycling":
    case "transit":
      return rawMode.toLowerCase() as TravelMode;
    case "two-wheeler":
    case "two_wheeler":
    case "twowheeler":
      return "two-wheeler";
    default:
      return null;
  }
}

function extractDirectionsFromPath(parsedUrl: URL): {
  originText: string | null;
  destinationText: string | null;
} {
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const dirIndex = segments.findIndex((segment) => segment.toLowerCase() === "dir");
  if (dirIndex === -1) {
    return { originText: null, destinationText: null };
  }

  const rawSegments = segments.slice(dirIndex + 1).filter((segment) => {
    const lowered = segment.toLowerCase();
    return (
      lowered !== "maps" &&
      !lowered.startsWith("@") &&
      !lowered.startsWith("data=!") &&
      lowered !== ""
    );
  });

  const decodedSegments = rawSegments
    .map((segment) => decodeHumanText(segment))
    .filter((segment): segment is string => segment !== null);

  return {
    originText: decodedSegments[0] ?? null,
    destinationText: decodedSegments[1] ?? null,
  };
}

function extractRouteData(parsedUrl: URL): RouteData | null {
  const pathRoute = extractDirectionsFromPath(parsedUrl);
  const originText =
    trimToNull(parsedUrl.searchParams.get("origin")) ?? pathRoute.originText;
  const destinationText =
    trimToNull(parsedUrl.searchParams.get("destination")) ?? pathRoute.destinationText;

  const rawWaypoints = trimToNull(parsedUrl.searchParams.get("waypoints"));
  const waypoints =
    rawWaypoints === null
      ? []
      : rawWaypoints
          .split("|")
          .map((waypoint) => waypoint.trim())
          .filter((waypoint) => waypoint !== "");

  const travelMode = extractTravelMode(parsedUrl);
  if (
    originText === null &&
    destinationText === null &&
    waypoints.length === 0 &&
    travelMode === null
  ) {
    return null;
  }

  return {
    originText,
    destinationText,
    waypoints,
    travelMode,
    distanceMeters: null,
    durationSeconds: null,
    polyline: null,
  };
}

function extractMapAction(parsedUrl: URL): MapAction | null {
  const rawAction = trimToNull(parsedUrl.searchParams.get("map_action"));
  if (rawAction === null) return null;

  switch (rawAction.toLowerCase()) {
    case "map":
      return "map";
    case "pano":
      return "pano";
    default:
      return null;
  }
}

function extractZoom(rawUrl: string, parsedUrl: URL): number | null {
  const atMatch = rawUrl.match(AT_PATTERN);
  const zoomFromAt = parseFiniteNumber(atMatch?.[3]);
  if (zoomFromAt !== null) return zoomFromAt;

  return parseFiniteNumber(parsedUrl.searchParams.get("z"));
}

function extractHeading(parsedUrl: URL): number | null {
  return parseFiniteNumber(parsedUrl.searchParams.get("heading"));
}

function extractPitch(parsedUrl: URL): number | null {
  return parseFiniteNumber(parsedUrl.searchParams.get("pitch"));
}

function extractPanoId(parsedUrl: URL): string | null {
  return trimToNull(parsedUrl.searchParams.get("pano"));
}

function detectIntent(args: {
  location: LocationData | null;
  placeTitle: string | null;
  featureId: string | null;
  query: QueryData | null;
  route: RouteData | null;
  mapView: MapViewData | null;
}): GoogleMapsIntent {
  if (args.mapView?.mapAction === "pano" || args.mapView?.panoId !== null) {
    return "streetview";
  }

  if (args.route !== null) {
    return "directions";
  }

  if (args.query?.text !== null) {
    return "search";
  }

  if (args.placeTitle !== null || args.featureId !== null) {
    return "place";
  }

  if (args.mapView?.mapAction === "map") {
    return "map";
  }

  if (args.location !== null) {
    return "coordinates";
  }

  return "unknown";
}

function inferPlusCode(text: string | null): PlusCode | null {
  if (text === null) return null;

  const match = text.match(PLUS_CODE_PATTERN);
  if (match?.[1] === undefined) return null;

  return {
    globalCode: match[1].toUpperCase(),
    compoundCode: null,
  };
}

function detectPatterns(rawUrl: string, parsedUrl: URL): readonly string[] {
  const patterns: string[] = [];

  if (AT_PATTERN.test(rawUrl)) patterns.push("at-pattern");
  if (coordsFromParamValue(parsedUrl.searchParams.get("q"), "query-param")) {
    patterns.push("q-param");
  }
  if (coordsFromParamValue(parsedUrl.searchParams.get("query"), "query-param")) {
    patterns.push("query-param");
  }
  if (DATA_PATTERN.test(rawUrl)) patterns.push("data-param");
  if (PLACE_COORDS_PATTERN.test(rawUrl)) patterns.push("place-path");
  if (coordsFromParamValue(parsedUrl.searchParams.get("ll"), "ll-param")) {
    patterns.push("ll-param");
  }
  if (coordsFromParamValue(parsedUrl.searchParams.get("sll"), "ll-param")) {
    patterns.push("sll-param");
  }
  if (
    coordsFromParamValue(parsedUrl.searchParams.get("destination"), "destination-param")
  ) {
    patterns.push("destination-param");
  }
  if (coordsFromParamValue(parsedUrl.searchParams.get("viewpoint"), "viewpoint-param")) {
    patterns.push("viewpoint-param");
  }

  return patterns;
}

export function extractCoordsFromUrl(rawUrl: string): CoordinateMatch | null {
  const atResult = fromMatch(rawUrl.match(AT_PATTERN), "at-pattern");
  if (atResult !== null) return atResult;

  const parsedUrl = safeParseUrl(rawUrl);
  if (parsedUrl !== null) {
    const qResult = coordsFromParamValue(parsedUrl.searchParams.get("q"), "query-param");
    if (qResult !== null) return qResult;

    const queryResult = coordsFromParamValue(
      parsedUrl.searchParams.get("query"),
      "query-param",
    );
    if (queryResult !== null) return queryResult;
  }

  const dataResult = fromMatch(rawUrl.match(DATA_PATTERN), "data-param");
  if (dataResult !== null) return dataResult;

  const placeResult = fromMatch(rawUrl.match(PLACE_COORDS_PATTERN), "place-path");
  if (placeResult !== null) return placeResult;

  if (parsedUrl !== null) {
    const llResult =
      coordsFromParamValue(parsedUrl.searchParams.get("ll"), "ll-param") ??
      coordsFromParamValue(parsedUrl.searchParams.get("sll"), "ll-param");
    if (llResult !== null) return llResult;

    const destinationResult = coordsFromParamValue(
      parsedUrl.searchParams.get("destination"),
      "destination-param",
    );
    if (destinationResult !== null) return destinationResult;

    const viewpointResult = coordsFromParamValue(
      parsedUrl.searchParams.get("viewpoint"),
      "viewpoint-param",
    );
    if (viewpointResult !== null) return viewpointResult;
  }

  return null;
}

export function extractFeatureId(rawUrl: string): string | null {
  const parsedUrl = safeParseUrl(rawUrl);
  if (parsedUrl === null) return null;

  const queryFeatureId = trimToNull(parsedUrl.searchParams.get("ftid"));
  if (queryFeatureId !== null && FTID_PATTERN.test(queryFeatureId)) {
    return queryFeatureId;
  }

  const pathMatch = rawUrl.match(FTID_PATTERN);
  return pathMatch?.[0] ?? null;
}

export function extractQueryText(rawUrl: string): string | null {
  const parsedUrl = safeParseUrl(rawUrl);
  if (parsedUrl === null) return null;

  const qResult = extractSearchTextFromParam(parsedUrl, "q", "q-param");
  if (qResult !== null && qResult.text !== null) return qResult.text;

  const queryResult = extractSearchTextFromParam(parsedUrl, "query", "query-param");
  if (queryResult !== null && queryResult.text !== null) return queryResult.text;

  return null;
}

export function extractGeocodeText(rawUrl: string): string | null {
  const queryText = extractQueryText(rawUrl);
  if (queryText !== null) return queryText;

  const parsedUrl = safeParseUrl(rawUrl);
  if (parsedUrl === null) return null;

  return extractPlacePathText(parsedUrl);
}

function toErrorEnvelope(
  rawInput: string,
  error:
    | EmptyInputError
    | InvalidGoogleMapsUrlError
    | DisallowedHostnameError
    | UnsupportedGoogleMapsUrlError,
): GoogleMapsEnvelope {
  return createEnvelope({
    mode: "minimal",
    intent: "unknown",
    input: createInputMetadata({
      raw: rawInput,
      normalized: rawInput,
      hostname: null,
      hostKind: "unknown",
      isGoogleMapsUrl: false,
      isShortLink: false,
      canonicalized: null,
    }),
    resolution: createResolutionMetadata({ status: "not-attempted" }),
    error: createErrorSummary(error.code, error.message),
  });
}

export function parseGoogleMapsUrl(
  rawInput: string,
  options: ParseOptions = {},
): GoogleMapsEnvelope {
  const trimmedInput = trimToNull(rawInput);
  if (trimmedInput === null) {
    return toErrorEnvelope("", new EmptyInputError());
  }

  const parsedUrl = safeParseUrl(trimmedInput);
  if (parsedUrl === null) {
    return toErrorEnvelope(
      trimmedInput,
      new InvalidGoogleMapsUrlError("Input is not a valid URL.", {
        details: trimmedInput,
      }),
    );
  }

  const hostKind = classifyHostname(parsedUrl.hostname);
  if (hostKind === "disallowed") {
    return toErrorEnvelope(trimmedInput, new DisallowedHostnameError(parsedUrl.hostname));
  }

  if (hostKind === "unsupported-shortlink") {
    return toErrorEnvelope(
      trimmedInput,
      new UnsupportedGoogleMapsUrlError(
        "share.google links are recognized but unsupported for public resolution.",
        { details: parsedUrl.hostname },
      ),
    );
  }

  if (!isGoogleMapsUrl(trimmedInput)) {
    return toErrorEnvelope(
      trimmedInput,
      new UnsupportedGoogleMapsUrlError(
        "URL is not a supported public Google Maps link.",
        { details: trimmedInput },
      ),
    );
  }

  const canonicalizedInput = canonicalizeGoogleMapsUrl(trimmedInput);
  const workingUrl = canonicalizedInput;
  const workingParsedUrl = new URL(workingUrl);
  const coordinateMatch = extractCoordsFromUrl(workingUrl);
  const location =
    coordinateMatch === null
      ? absentSection<LocationData>()
      : createSection(
          "present",
          createLocationData(coordinateMatch),
          [],
          [
            {
              stage: "parse",
              source: coordinateMatch.source,
              confidence: "high",
              url: workingUrl,
            },
          ],
        );

  const placeTitle = extractPlacePathText(workingParsedUrl);
  const featureId = extractFeatureId(workingUrl);
  const searchQuery =
    extractSearchTextFromParam(workingParsedUrl, "q", "q-param") ??
    extractSearchTextFromParam(workingParsedUrl, "query", "query-param");
  const querySection =
    searchQuery === null && extractMapAction(workingParsedUrl) === null
      ? absentSection<QueryData>()
      : createSection(
          "present",
          searchQuery ?? {
            text: null,
            source: null,
            isCoordinateQuery: false,
            mapAction: extractMapAction(workingParsedUrl),
          },
          [],
          [
            {
              stage: "parse",
              source: searchQuery?.source ?? "map-action",
              confidence: "medium",
              url: workingUrl,
            },
          ],
        );

  const routeValue = extractRouteData(workingParsedUrl);
  const routeSection =
    routeValue === null
      ? absentSection<RouteData>()
      : createSection(
          "present",
          routeValue,
          [],
          [
            {
              stage: "parse",
              source: "directions-url",
              confidence: "medium",
              url: workingUrl,
            },
          ],
        );

  const mapViewValue: MapViewData | null = (() => {
    const center = coordinateMatch === null ? null : createLocationData(coordinateMatch);
    const zoom = extractZoom(workingUrl, workingParsedUrl);
    const heading = extractHeading(workingParsedUrl);
    const pitch = extractPitch(workingParsedUrl);
    const panoId = extractPanoId(workingParsedUrl);
    const mapAction = extractMapAction(workingParsedUrl);

    if (
      center === null &&
      zoom === null &&
      heading === null &&
      pitch === null &&
      panoId === null &&
      mapAction === null
    ) {
      return null;
    }

    return {
      center,
      zoom,
      heading,
      pitch,
      panoId,
      mapAction,
    };
  })();

  const mapViewSection =
    mapViewValue === null
      ? absentSection<MapViewData>()
      : createSection(
          "present",
          mapViewValue,
          [],
          [
            {
              stage: "parse",
              source: "map-view",
              confidence: mapViewValue.mapAction === "pano" ? "medium" : "high",
              url: workingUrl,
            },
          ],
        );

  const placeValue: PlaceData | null =
    placeTitle === null && featureId === null
      ? null
      : {
          title: placeTitle,
          formattedAddress: null,
          featureId,
          placeId: null,
          district: null,
          city: null,
          country: null,
          types: [],
          plusCode: inferPlusCode(placeTitle),
        };

  const placeSection =
    placeValue === null
      ? absentSection<PlaceData>()
      : createSection(
          "present",
          placeValue,
          [],
          [
            {
              stage: "parse",
              source: placeTitle === null ? "feature-id" : "place-path",
              confidence: featureId === null ? "medium" : "high",
              url: workingUrl,
            },
          ],
        );

  const intent = detectIntent({
    location: location.value,
    placeTitle,
    featureId,
    query: querySection.value,
    route: routeSection.value,
    mapView: mapViewSection.value,
  });

  const parseArtifacts: ParseArtifactsRaw | undefined =
    options.raw?.enabled === true
      ? {
          canonicalizedInput: workingUrl,
          matchedPattern: coordinateMatch?.source ?? null,
          detectedPatterns: detectPatterns(workingUrl, workingParsedUrl),
        }
      : undefined;

  const envelope = createEnvelope({
    mode: "minimal",
    intent,
    input: createInputMetadata({
      raw: trimmedInput,
      normalized: workingUrl,
      hostname: workingParsedUrl.hostname,
      hostKind,
      isGoogleMapsUrl: true,
      isShortLink: isShortLinkDomain(workingParsedUrl.hostname),
      canonicalized: canonicalizedInput === trimmedInput ? null : canonicalizedInput,
    }),
    resolution: createResolutionMetadata({
      status: isShortLinkDomain(workingParsedUrl.hostname)
        ? "not-attempted"
        : "not-needed",
    }),
    identifiers: {
      featureId,
      plusCode: inferPlusCode(searchQuery?.text ?? placeTitle),
    },
    location,
    place: placeSection,
    route: routeSection,
    query: querySection,
    mapView: mapViewSection,
  });

  return withRawParseArtifacts(envelope, parseArtifacts);
}

function errorFromEnvelope(
  error: GoogleMapsEnvelope["error"],
):
  | EmptyInputError
  | InvalidGoogleMapsUrlError
  | DisallowedHostnameError
  | UnsupportedGoogleMapsUrlError {
  if (error === null) {
    return new UnsupportedGoogleMapsUrlError("Unknown Google Maps parse failure.");
  }

  switch (error.code) {
    case "empty_input":
      return new EmptyInputError();
    case "invalid_url":
      return new InvalidGoogleMapsUrlError(error.message);
    case "disallowed_hostname":
      return new DisallowedHostnameError(error.message);
    case "unsupported_url":
      return new UnsupportedGoogleMapsUrlError(error.message);
    default:
      return new UnsupportedGoogleMapsUrlError(error.message);
  }
}

export function parseGoogleMapsUrlOrThrow(
  rawInput: string,
  options: ParseOptions = {},
): GoogleMapsEnvelope {
  const result = parseGoogleMapsUrl(rawInput, options);
  if (result.status === "error") {
    throw errorFromEnvelope(result.error);
  }

  return result;
}
```

### `src/types.ts`

```ts
export type GoogleMapsMode = "minimal" | "unfurl" | "enriched";

export type EnrichmentPolicy = "when-needed" | "always";

export type GoogleMapsIntent =
  | "coordinates"
  | "place"
  | "search"
  | "directions"
  | "map"
  | "streetview"
  | "unknown";

export type ResultStatus = "ok" | "error";

export type SectionStatus =
  | "present"
  | "absent"
  | "not-requested"
  | "unsupported"
  | "error";

export type DiagnosticSeverity = "info" | "warning" | "error";

export type HostKind =
  | "standard"
  | "shortlink"
  | "unsupported-shortlink"
  | "disallowed"
  | "unknown";

export type ResolutionStatus =
  | "not-attempted"
  | "not-needed"
  | "resolved"
  | "dead-end"
  | "error";

export type Confidence = "high" | "medium" | "weak";

export type RawStage =
  | "parse"
  | "redirects"
  | "resolved-url"
  | "html"
  | "geocoding"
  | "reverse-geocoding"
  | "places"
  | "directions"
  | "provider-error";

export type CoordinateSource =
  | "at-pattern"
  | "query-param"
  | "data-param"
  | "place-path"
  | "ll-param"
  | "destination-param"
  | "viewpoint-param"
  | "html-json-ld"
  | "html-geo-intent"
  | "html-data-param"
  | "html-app-state"
  | "html-center-pattern"
  | "html-app-initialization-state"
  | "provider-geocoding"
  | "provider-places";

export type QueryTextSource =
  | "q-param"
  | "query-param"
  | "destination-param"
  | "origin-param"
  | "place-path";

export type MapAction = "map" | "pano";

export type TravelMode = "driving" | "walking" | "bicycling" | "transit" | "two-wheeler";

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: DiagnosticSeverity;
  readonly details?: string | undefined;
}

export interface ProvenanceRecord {
  readonly stage: RawStage | "canonicalize" | "detect-intent" | "normalize";
  readonly source: string;
  readonly confidence: Confidence;
  readonly url?: string | undefined;
}

export interface NormalizedSection<TValue> {
  readonly status: SectionStatus;
  readonly value: TValue | null;
  readonly provenance: readonly ProvenanceRecord[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface LocationData extends Coordinates {
  readonly source: CoordinateSource;
  readonly accuracy: "exact" | "approximate";
}

export interface AddressComponent {
  readonly longName: string;
  readonly shortName: string;
  readonly types: readonly string[];
}

export interface PlusCode {
  readonly globalCode: string | null;
  readonly compoundCode: string | null;
}

export interface PlaceData {
  readonly title: string | null;
  readonly formattedAddress: string | null;
  readonly featureId: string | null;
  readonly placeId: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly country: string | null;
  readonly types: readonly string[];
  readonly plusCode: PlusCode | null;
}

export interface RouteData {
  readonly originText: string | null;
  readonly destinationText: string | null;
  readonly waypoints: readonly string[];
  readonly travelMode: TravelMode | null;
  readonly distanceMeters: number | null;
  readonly durationSeconds: number | null;
  readonly polyline: string | null;
}

export interface QueryData {
  readonly text: string | null;
  readonly source: QueryTextSource | null;
  readonly isCoordinateQuery: boolean;
  readonly mapAction: MapAction | null;
}

export interface MapViewData {
  readonly center: LocationData | null;
  readonly zoom: number | null;
  readonly heading: number | null;
  readonly pitch: number | null;
  readonly panoId: string | null;
  readonly mapAction: MapAction | null;
}

export interface ErrorSummary {
  readonly code: string;
  readonly message: string;
}

export interface RedirectHopRaw {
  readonly requestUrl: string;
  readonly responseStatus: number;
  readonly locationHeader: string | null;
}

export interface ParseArtifactsRaw {
  readonly canonicalizedInput: string;
  readonly matchedPattern: string | null;
  readonly detectedPatterns: readonly string[];
}

export interface ResolutionArtifactsRaw {
  readonly hops: readonly RedirectHopRaw[];
  readonly finalHttpStatus: number | null;
}

export interface HtmlObservationRaw {
  readonly kind: string;
  readonly value: string;
}

export interface HtmlArtifactsRaw {
  readonly extractedUrls: readonly string[];
  readonly observations: readonly HtmlObservationRaw[];
}

export interface ProviderRawArtifact {
  readonly requestUrl: string;
  readonly providerStatus: string | null;
  readonly body: unknown;
}

export interface ProviderDeniedRawArtifact {
  readonly provider: "geocoding" | "reverse-geocoding" | "places" | "directions";
  readonly providerStatus: string;
  readonly errorMessage: string | null;
  readonly body: unknown;
}

export interface RawArtifacts {
  readonly parse?: ParseArtifactsRaw | undefined;
  readonly redirects?: ResolutionArtifactsRaw | undefined;
  readonly resolvedUrl?: {
    readonly finalUrl: string;
  };
  readonly html?: HtmlArtifactsRaw | undefined;
  readonly geocoding?: ProviderRawArtifact | undefined;
  readonly reverseGeocoding?: ProviderRawArtifact | undefined;
  readonly places?: ProviderRawArtifact | undefined;
  readonly directions?: ProviderRawArtifact | undefined;
  readonly providerErrors?: readonly ProviderDeniedRawArtifact[] | undefined;
}

export interface InputMetadata {
  readonly raw: string;
  readonly normalized: string;
  readonly hostname: string | null;
  readonly hostKind: HostKind;
  readonly isGoogleMapsUrl: boolean;
  readonly isShortLink: boolean;
  readonly canonicalized: string | null;
}

export interface ResolutionMetadata {
  readonly status: ResolutionStatus;
  readonly resolvedUrl: string | null;
  readonly redirectCount: number;
  readonly finalHttpStatus: number | null;
  readonly usedHtmlFallback: boolean;
}

export interface GoogleMapsEnvelope {
  readonly status: ResultStatus;
  readonly mode: GoogleMapsMode;
  readonly intent: GoogleMapsIntent;
  readonly diagnostics: readonly Diagnostic[];
  readonly error: ErrorSummary | null;
  readonly input: InputMetadata;
  readonly resolution: ResolutionMetadata;
  readonly identifiers: {
    readonly featureId: string | null;
    readonly placeId: string | null;
    readonly plusCode: PlusCode | null;
  };
  readonly location: NormalizedSection<LocationData>;
  readonly place: NormalizedSection<PlaceData>;
  readonly route: NormalizedSection<RouteData>;
  readonly query: NormalizedSection<QueryData>;
  readonly mapView: NormalizedSection<MapViewData>;
  readonly raw?: RawArtifacts | undefined;
}

export type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface RawCaptureOptions {
  readonly enabled?: boolean | undefined;
  readonly stages?: readonly RawStage[] | undefined;
}

export interface ParseOptions {
  readonly raw?: RawCaptureOptions | undefined;
}

export interface UnfurlOptions extends ParseOptions {
  readonly fetch?: FetchFunction | undefined;
  readonly maxRedirects?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly enableHtmlFallback?: boolean | undefined;
}

export interface GoogleApiEnrichmentOptions {
  readonly apiKey: string;
  readonly fetch?: FetchFunction | undefined;
  readonly timeoutMs?: number | undefined;
  readonly region?: string | undefined;
  readonly language?: string | undefined;
  readonly enableReverseGeocoding?: boolean | undefined;
  readonly enableGeocoding?: boolean | undefined;
  readonly enablePlaces?: boolean | undefined;
  readonly enableDirections?: boolean | undefined;
}

export interface AnalyzeOptions extends UnfurlOptions {
  readonly mode?: GoogleMapsMode | undefined;
  readonly enrich?: {
    readonly policy?: EnrichmentPolicy | undefined;
    readonly google?: GoogleApiEnrichmentOptions | undefined;
  };
}

export interface ResolvedGoogleMapsUrl {
  readonly inputUrl: string;
  readonly canonicalUrl: string;
  readonly resolvedUrl: string;
  readonly redirectCount: number;
  readonly finalHttpStatus: number | null;
  readonly usedHtmlFallback: boolean;
  readonly raw?: RawArtifacts | undefined;
}
```

### `src/unfurl.ts`

```ts
import {
  EmptyInputError,
  GoogleMapsUrlError,
  InvalidGoogleMapsUrlError,
  NetworkRequestError,
  NetworkTimeoutError,
  RedirectLimitError,
  UnsupportedGoogleMapsUrlError,
} from "./errors";
import {
  assertAllowedHostname,
  canonicalizeGoogleMapsUrl,
  classifyHostname,
  isGoogleMapsUrl,
  isShortLinkDomain,
} from "./domain";
import { trimToNull } from "./guards";
import { extractHtmlSignals } from "./html-extract";
import {
  appendRawArtifacts,
  createEnvelope,
  createErrorSummary,
  createInputMetadata,
  createResolutionMetadata,
  mergeDiagnostics,
  withTopLevelError,
} from "./normalize";
import {
  extractCoordsFromUrl,
  extractGeocodeText,
  parseGoogleMapsUrl,
  parseGoogleMapsUrlOrThrow,
} from "./parser";
import type {
  Diagnostic,
  GoogleMapsEnvelope,
  RawArtifacts,
  RedirectHopRaw,
  ResolvedGoogleMapsUrl,
  UnfurlOptions,
} from "./types";

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 5000;

interface FetchStepResult {
  readonly resolvedUrl: string;
  readonly finalHttpStatus: number | null;
  readonly hops: readonly RedirectHopRaw[];
}

interface HtmlFallbackResult extends FetchStepResult {
  readonly usedHtmlFallback: boolean;
  readonly htmlArtifacts?: RawArtifacts["html"];
}

function shouldCaptureRaw(
  options: UnfurlOptions,
  stage: NonNullable<NonNullable<UnfurlOptions["raw"]>["stages"]>[number],
): boolean {
  if (options.raw?.enabled !== true) return false;
  if (options.raw.stages === undefined) return true;
  return options.raw.stages.includes(stage);
}

function normalizeInputOrThrow(rawInput: string): {
  readonly trimmed: string;
  readonly canonicalUrl: string;
} {
  const trimmed = trimToNull(rawInput);
  if (trimmed === null) {
    throw new EmptyInputError();
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new InvalidGoogleMapsUrlError("Input is not a valid URL.", {
      details: trimmed,
    });
  }

  assertAllowedHostname(parsedUrl.hostname);
  if (!isGoogleMapsUrl(trimmed)) {
    throw new UnsupportedGoogleMapsUrlError(
      "URL is not a supported public Google Maps link.",
      { details: trimmed },
    );
  }

  return {
    trimmed,
    canonicalUrl: canonicalizeGoogleMapsUrl(trimmed),
  };
}

async function fetchWithTimeout(
  fetchFn: NonNullable<UnfurlOptions["fetch"]>,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchFn(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkTimeoutError(timeoutMs);
    }

    throw new NetworkRequestError("Failed to fetch Google Maps URL.", {
      cause: error,
      details: url,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function followHeadRedirects(
  startUrl: string,
  options: UnfurlOptions,
): Promise<FetchStepResult> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let currentUrl = startUrl;
  const hops: RedirectHopRaw[] = [];

  for (;;) {
    const response = await fetchWithTimeout(
      fetchFn,
      currentUrl,
      { method: "HEAD" },
      timeoutMs,
    );

    const locationHeader = response.headers.get("location");
    hops.push({
      requestUrl: currentUrl,
      responseStatus: response.status,
      locationHeader,
    });

    if (response.status < 300 || response.status >= 400) {
      return {
        resolvedUrl: currentUrl,
        finalHttpStatus: response.status,
        hops,
      };
    }

    if (locationHeader === null) {
      return {
        resolvedUrl: currentUrl,
        finalHttpStatus: response.status,
        hops,
      };
    }

    if (hops.length > maxRedirects) {
      throw new RedirectLimitError(maxRedirects);
    }

    const nextUrl = new URL(locationHeader, currentUrl).toString();
    const nextParsed = new URL(nextUrl);
    assertAllowedHostname(nextParsed.hostname);
    currentUrl = nextUrl;
  }
}

async function followGetFallback(
  startUrl: string,
  options: UnfurlOptions,
): Promise<HtmlFallbackResult> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let currentUrl = startUrl;
  const hops: RedirectHopRaw[] = [];
  let geocodeCandidateUrl: string | null =
    extractGeocodeText(currentUrl) === null ? null : currentUrl;

  for (;;) {
    const response = await fetchWithTimeout(
      fetchFn,
      currentUrl,
      {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
        },
      },
      timeoutMs,
    );

    const locationHeader = response.headers.get("location");
    hops.push({
      requestUrl: currentUrl,
      responseStatus: response.status,
      locationHeader,
    });

    if (response.status >= 300 && response.status < 400) {
      if (locationHeader === null) {
        return {
          resolvedUrl: currentUrl,
          finalHttpStatus: response.status,
          hops,
          usedHtmlFallback: false,
        };
      }

      if (hops.length > maxRedirects) {
        throw new RedirectLimitError(maxRedirects);
      }

      const nextUrl = new URL(locationHeader, currentUrl).toString();
      const nextParsed = new URL(nextUrl);
      assertAllowedHostname(nextParsed.hostname);

      if (extractCoordsFromUrl(nextUrl) !== null) {
        return {
          resolvedUrl: nextUrl,
          finalHttpStatus: null,
          hops,
          usedHtmlFallback: false,
        };
      }

      if (extractGeocodeText(nextUrl) !== null) {
        geocodeCandidateUrl = nextUrl;
      }

      currentUrl = nextUrl;
      continue;
    }

    const responseUrl = response.url === "" ? currentUrl : response.url;
    const responseParsed = new URL(responseUrl);
    assertAllowedHostname(responseParsed.hostname);

    if (extractCoordsFromUrl(responseUrl) !== null) {
      return {
        resolvedUrl: responseUrl,
        finalHttpStatus: response.status,
        hops,
        usedHtmlFallback: false,
      };
    }

    const body = await response.text();
    const htmlSignals = extractHtmlSignals(body);

    if (htmlSignals.location !== null) {
      return {
        resolvedUrl: htmlSignals.geocodeCandidateUrl ?? responseUrl,
        finalHttpStatus: response.status,
        hops,
        usedHtmlFallback: true,
        htmlArtifacts: htmlSignals.artifacts,
      };
    }

    if (htmlSignals.geocodeCandidateUrl !== null) {
      return {
        resolvedUrl: htmlSignals.geocodeCandidateUrl,
        finalHttpStatus: response.status,
        hops,
        usedHtmlFallback: true,
        htmlArtifacts: htmlSignals.artifacts,
      };
    }

    return {
      resolvedUrl: geocodeCandidateUrl ?? responseUrl,
      finalHttpStatus: response.status,
      hops,
      usedHtmlFallback: false,
      htmlArtifacts:
        htmlSignals.artifacts.extractedUrls.length === 0 &&
        htmlSignals.artifacts.observations.length === 0
          ? undefined
          : htmlSignals.artifacts,
    };
  }
}

function createUnfurlErrorEnvelope(
  rawInput: string,
  error: GoogleMapsUrlError,
): GoogleMapsEnvelope {
  const hostname = (() => {
    try {
      return new URL(trimToNull(rawInput) ?? "").hostname;
    } catch {
      return null;
    }
  })();

  const hostKind = hostname === null ? "unknown" : classifyHostname(hostname);
  const normalized = trimToNull(rawInput) ?? "";

  const baseEnvelope = createEnvelope({
    mode: "unfurl",
    intent: "unknown",
    input: createInputMetadata({
      raw: normalized,
      normalized,
      hostname,
      hostKind,
      isGoogleMapsUrl: hostname === null ? false : isGoogleMapsUrl(normalized),
      isShortLink: hostname === null ? false : isShortLinkDomain(hostname),
      canonicalized: null,
    }),
    resolution: createResolutionMetadata({
      status:
        error.code === "network_error" || error.code === "network_timeout"
          ? "error"
          : "not-attempted",
    }),
  });

  return withTopLevelError(baseEnvelope, createErrorSummary(error.code, error.message));
}

function createNetworkErrorEnvelope(
  rawInput: string,
  error: unknown,
): GoogleMapsEnvelope {
  if (error instanceof GoogleMapsUrlError) {
    return createUnfurlErrorEnvelope(rawInput, error);
  }

  const wrappedError = new NetworkRequestError("Unexpected Google Maps unfurl failure.", {
    cause: error,
    details: trimToNull(rawInput) ?? "",
  });
  return createUnfurlErrorEnvelope(rawInput, wrappedError);
}

function createResolutionDiagnostics(args: {
  usedHtmlFallback: boolean;
  finalHttpStatus: number | null;
  resolvedUrl: string;
  requestedUrl: string;
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (args.usedHtmlFallback) {
    diagnostics.push({
      code: "html_fallback_used",
      message: "HTML shell fallback was used to improve resolution.",
      severity: "info",
    });
  }

  if (args.finalHttpStatus !== null && args.finalHttpStatus >= 400) {
    diagnostics.push({
      code: "dead_shortlink",
      message: `Final Google Maps response returned HTTP ${args.finalHttpStatus}.`,
      severity: "warning",
    });
  }

  if (args.resolvedUrl !== args.requestedUrl) {
    diagnostics.push({
      code: "resolved_url_changed",
      message: "Public Google Maps resolution changed the effective URL.",
      severity: "info",
    });
  }

  return diagnostics;
}

export async function resolveGoogleMapsUrl(
  rawInput: string,
  options: UnfurlOptions = {},
): Promise<ResolvedGoogleMapsUrl> {
  const normalized = normalizeInputOrThrow(rawInput);
  const requestedUrl = normalized.canonicalUrl;
  const inputIsShortLink = isShortLinkDomain(new URL(requestedUrl).hostname);

  if (!inputIsShortLink) {
    const directCoords = extractCoordsFromUrl(requestedUrl);
    if (directCoords !== null || options.enableHtmlFallback !== true) {
      const rawArtifacts =
        options.raw?.enabled === true
          ? appendRawArtifacts(
              undefined,
              shouldCaptureRaw(options, "resolved-url")
                ? { resolvedUrl: { finalUrl: requestedUrl } }
                : {},
            )
          : undefined;

      return {
        inputUrl: trimToNull(rawInput) ?? rawInput,
        canonicalUrl: requestedUrl,
        resolvedUrl: requestedUrl,
        redirectCount: 0,
        finalHttpStatus: null,
        usedHtmlFallback: false,
        raw: rawArtifacts,
      };
    }

    const getResult = await followGetFallback(requestedUrl, options);
    let rawArtifacts: RawArtifacts | undefined;
    if (shouldCaptureRaw(options, "resolved-url")) {
      rawArtifacts = appendRawArtifacts(rawArtifacts, {
        resolvedUrl: { finalUrl: getResult.resolvedUrl },
      });
    }
    if (shouldCaptureRaw(options, "html") && getResult.htmlArtifacts !== undefined) {
      rawArtifacts = appendRawArtifacts(rawArtifacts, {
        html: getResult.htmlArtifacts,
      });
    }

    return {
      inputUrl: trimToNull(rawInput) ?? rawInput,
      canonicalUrl: requestedUrl,
      resolvedUrl: getResult.resolvedUrl,
      redirectCount: getResult.hops.length,
      finalHttpStatus: getResult.finalHttpStatus,
      usedHtmlFallback: getResult.usedHtmlFallback,
      raw: rawArtifacts,
    };
  }

  const headResult = await followHeadRedirects(requestedUrl, options);
  const headHasDirectCoords = extractCoordsFromUrl(headResult.resolvedUrl) !== null;

  if (
    headHasDirectCoords ||
    (headResult.finalHttpStatus !== null && headResult.finalHttpStatus >= 400)
  ) {
    let rawArtifacts: RawArtifacts | undefined;
    if (shouldCaptureRaw(options, "redirects")) {
      rawArtifacts = appendRawArtifacts(rawArtifacts, {
        redirects: {
          hops: headResult.hops,
          finalHttpStatus: headResult.finalHttpStatus,
        },
      });
    }
    if (shouldCaptureRaw(options, "resolved-url")) {
      rawArtifacts = appendRawArtifacts(rawArtifacts, {
        resolvedUrl: { finalUrl: headResult.resolvedUrl },
      });
    }

    return {
      inputUrl: trimToNull(rawInput) ?? rawInput,
      canonicalUrl: requestedUrl,
      resolvedUrl: headResult.resolvedUrl,
      redirectCount: headResult.hops.length,
      finalHttpStatus: headResult.finalHttpStatus,
      usedHtmlFallback: false,
      raw: rawArtifacts,
    };
  }

  const getResult = await followGetFallback(headResult.resolvedUrl, options);
  let rawArtifacts: RawArtifacts | undefined;
  if (shouldCaptureRaw(options, "redirects")) {
    rawArtifacts = appendRawArtifacts(rawArtifacts, {
      redirects: {
        hops: [...headResult.hops, ...getResult.hops],
        finalHttpStatus: getResult.finalHttpStatus ?? headResult.finalHttpStatus,
      },
    });
  }
  if (shouldCaptureRaw(options, "resolved-url")) {
    rawArtifacts = appendRawArtifacts(rawArtifacts, {
      resolvedUrl: { finalUrl: getResult.resolvedUrl },
    });
  }
  if (shouldCaptureRaw(options, "html") && getResult.htmlArtifacts !== undefined) {
    rawArtifacts = appendRawArtifacts(rawArtifacts, {
      html: getResult.htmlArtifacts,
    });
  }

  return {
    inputUrl: trimToNull(rawInput) ?? rawInput,
    canonicalUrl: requestedUrl,
    resolvedUrl: getResult.resolvedUrl,
    redirectCount: headResult.hops.length + getResult.hops.length,
    finalHttpStatus: getResult.finalHttpStatus ?? headResult.finalHttpStatus,
    usedHtmlFallback: getResult.usedHtmlFallback,
    raw: rawArtifacts,
  };
}

function upgradeEnvelopeMode(
  envelope: GoogleMapsEnvelope,
  mode: GoogleMapsEnvelope["mode"],
): GoogleMapsEnvelope {
  if (envelope.mode === mode) return envelope;
  return { ...envelope, mode };
}

export async function unfurlGoogleMapsUrlOrThrow(
  rawInput: string,
  options: UnfurlOptions = {},
): Promise<GoogleMapsEnvelope> {
  const minimalEnvelope = parseGoogleMapsUrlOrThrow(rawInput, options);
  const requestedUrl = minimalEnvelope.input.normalized;
  const requestedIsShortLink = minimalEnvelope.input.isShortLink;

  if (!requestedIsShortLink && options.enableHtmlFallback !== true) {
    return upgradeEnvelopeMode(
      {
        ...minimalEnvelope,
        resolution: createResolutionMetadata({
          status: "not-needed",
          resolvedUrl: requestedUrl,
        }),
      },
      "unfurl",
    );
  }

  const resolved = await resolveGoogleMapsUrl(rawInput, options);
  const resolvedParsed = parseGoogleMapsUrl(resolved.resolvedUrl, options);
  const resolutionStatus =
    resolved.finalHttpStatus !== null && resolved.finalHttpStatus >= 400
      ? "dead-end"
      : requestedIsShortLink ||
          resolved.usedHtmlFallback ||
          resolved.resolvedUrl !== requestedUrl
        ? "resolved"
        : "not-needed";

  const diagnostics = createResolutionDiagnostics({
    usedHtmlFallback: resolved.usedHtmlFallback,
    finalHttpStatus: resolved.finalHttpStatus,
    resolvedUrl: resolved.resolvedUrl,
    requestedUrl,
  });

  if (resolvedParsed.status === "error") {
    const unresolvedRaw = appendRawArtifacts(minimalEnvelope.raw, resolved.raw ?? {});
    const unresolvedEnvelope = createEnvelope({
      mode: "unfurl",
      intent: minimalEnvelope.intent,
      input: createInputMetadata({
        raw: minimalEnvelope.input.raw,
        normalized: requestedUrl,
        hostname: minimalEnvelope.input.hostname,
        hostKind: minimalEnvelope.input.hostKind,
        isGoogleMapsUrl: minimalEnvelope.input.isGoogleMapsUrl,
        isShortLink: minimalEnvelope.input.isShortLink,
        canonicalized: minimalEnvelope.input.canonicalized,
      }),
      resolution: createResolutionMetadata({
        status: resolutionStatus,
        resolvedUrl: resolved.resolvedUrl,
        redirectCount: resolved.redirectCount,
        finalHttpStatus: resolved.finalHttpStatus,
        usedHtmlFallback: resolved.usedHtmlFallback,
      }),
      diagnostics,
      identifiers: {
        featureId: minimalEnvelope.identifiers.featureId,
        placeId: null,
        plusCode: minimalEnvelope.identifiers.plusCode,
      },
      location: minimalEnvelope.location,
      place: minimalEnvelope.place,
      route: minimalEnvelope.route,
      query: minimalEnvelope.query,
      mapView: minimalEnvelope.mapView,
      ...(unresolvedRaw === undefined ? {} : { raw: unresolvedRaw }),
    });

    return unresolvedEnvelope;
  }

  return {
    ...upgradeEnvelopeMode(resolvedParsed, "unfurl"),
    input: createInputMetadata({
      raw: minimalEnvelope.input.raw,
      normalized: requestedUrl,
      hostname: minimalEnvelope.input.hostname,
      hostKind: minimalEnvelope.input.hostKind,
      isGoogleMapsUrl: minimalEnvelope.input.isGoogleMapsUrl,
      isShortLink: minimalEnvelope.input.isShortLink,
      canonicalized: minimalEnvelope.input.canonicalized,
    }),
    resolution: createResolutionMetadata({
      status: resolutionStatus,
      resolvedUrl: resolved.resolvedUrl,
      redirectCount: resolved.redirectCount,
      finalHttpStatus: resolved.finalHttpStatus,
      usedHtmlFallback: resolved.usedHtmlFallback,
    }),
    diagnostics: mergeDiagnostics(resolvedParsed.diagnostics, diagnostics),
    raw: appendRawArtifacts(resolvedParsed.raw, resolved.raw ?? {}),
  };
}

export async function unfurlGoogleMapsUrl(
  rawInput: string,
  options: UnfurlOptions = {},
): Promise<GoogleMapsEnvelope> {
  try {
    return await unfurlGoogleMapsUrlOrThrow(rawInput, options);
  } catch (error) {
    return createNetworkErrorEnvelope(rawInput, error);
  }
}

export const resolveGoogleMapsUrlOrThrow = resolveGoogleMapsUrl;
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": true,
    "declaration": false,
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "docs", "src/**/*.test.ts", "src/**/__tests__/**"]
}
```

### `typedoc.json`

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPoints": ["src/index.ts"],
  "out": "docs/api-reference/generated",
  "json": "docs/api-reference/generated/api.json",
  "plugin": [],
  "excludeExternals": true,
  "excludePrivate": true,
  "excludeProtected": true,
  "readme": "none",
  "tsconfig": "tsconfig.json",
  "sort": ["source-order"]
}
```

## Setup / Release Instructions

### Local development

```bash
bun install
bun run check
bun run build
bun run docs:dev
```

### GitHub + npm trusted publishing checklist

1. Replace every `REPLACE_ME` placeholder in `package.json`, `README.md`, `docs/docs.json`, and workflow metadata.
2. Configure npm trusted publishing for the repository and package.
3. Ensure the release workflow has `id-token: write` and `contents: write`.
4. Generate and commit `bun.lock` from a machine with Bun installed.
5. Push a semver tag such as `v0.1.0`.

### Mintlify setup checklist

1. Install the Mintlify CLI dependencies with `bun install`.
2. Preview locally with `bun run docs:dev`.
3. Generate API reference inputs with `bun run docs:generate-api`.
4. Validate docs with `bun run docs:build`.
5. Connect the repository to Mintlify hosting or your chosen static-docs deployment path.

## Assumptions and Follow-ups

- The package intentionally targets **public shared Google Maps URLs only**.
- `featureId` from shared URLs stays separate from provider `placeId`.
- Provider-denied responses are modeled as diagnostics plus `raw.providerErrors`, not crashes.
- This environment could not generate a real `bun.lock`, so the repository includes the exact command and workflow path to create and commit it on first bootstrap.
- Before first public release, run `bun install --save-text-lockfile --lockfile-only`, `bun run check`, and `bun run docs:generate-api` on a machine with Bun and network access.
