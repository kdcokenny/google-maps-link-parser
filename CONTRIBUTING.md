# Contributing

## Local setup

1. Install Bun 1.3.x.
2. Install Node.js 20.17+ because the Mintlify CLI requires a modern Node runtime.
3. Clone the repository.
4. Install dependencies:

```bash
bun install
```

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
bun run release:tag
bun run release:tag:force
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

1. Update the version intentionally in `package.json`.
2. Commit the version bump and merge/push it to the default branch.
3. Sync your local default branch so `HEAD` exactly matches `origin/<defaultBranch>` (for example, `git pull --ff-only` on the default branch).
4. Ensure preflight is clean on that synced commit: `bun run check && bun run docs:generate-api && bun run docs:build && bun run build`.
5. Run `bun run release:tag` from the synced default-branch tip.
6. If tag push partially failed after local tag creation, fix the push issue and run `bun run release:tag:force` from the same release commit/version.
7. The release workflow validates the repo, verifies tag/version alignment and default-branch-tip alignment, publishes to npm using trusted publishing, then generates notes with `git-cliff` and creates a GitHub release.

## Notes for maintainers

- Replace all `REPLACE_ME` placeholders before first public publish.
- Configure npm trusted publishing against `.github/workflows/release.yml`.
- Commit `bun.lock` once generated; the workflow can bootstrap it if missing, but committed lockfiles should be the steady state.
