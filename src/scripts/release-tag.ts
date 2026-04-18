/**
 * Safe release-tag helper for npm publishing.
 *
 * Safety contract:
 * - Reads version from root package.json only
 * - Requires a clean working tree
 * - Requires HEAD to exactly match origin/<defaultBranch>
 * - Rejects non-stable semver versions
 * - Rejects conflicting local/remote tag states
 * - Rejects already-published npm versions
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const STABLE_SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const STABLE_RELEASE_TAG_REGEX = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const NPM_REGISTRY_BASE = "https://registry.npmjs.org";
const NPM_LOOKUP_TIMEOUT_MS = 30_000;

const USAGE_TEXT = [
  "Usage: bun run src/scripts/release-tag.ts [--force]",
  "",
  "Creates and pushes the vX.Y.Z release tag for package.json.",
  "",
  "Safety:",
  "- Requires a clean working tree.",
  "- Requires HEAD to equal the origin/<defaultBranch> tip after refreshing refs.",
  "- Requires npm name@version to be missing.",
  "- Never rewrites existing semver tags.",
  "",
  "--force:",
  "- Only retries pushing an existing local tag for the same release commit/version when the remote tag is still absent.",
].join("\n");

const MESSAGE_NOT_GIT_REPO = "Not a git repository; aborting without tag changes.";
const MESSAGE_INVALID_VERSION =
  "package.json version must be a stable semver release; aborting without tag changes.";
const MESSAGE_INVALID_TAG =
  "Derived tag is not a stable release tag; aborting without tag changes.";
const MESSAGE_ORIGIN_HEAD_UNRESOLVED =
  "Could not resolve origin/HEAD after refreshing refs; aborting without tag changes.";
const MESSAGE_NPM_CHECK_FAILED =
  "npm registry check failed; aborting without tag changes.";

interface ParsedArgs {
  force: boolean;
  help: boolean;
  unknownArg: string | null;
}

interface GitCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface GitContext {
  workTree: string;
}

type ExactNpmVersionState =
  | { state: "published" }
  | { state: "missing" }
  | { state: "indeterminate-error"; reason: string };

type ExactNpmVersionLookup = (
  packageName: string,
  version: string,
  signal?: AbortSignal,
) => Promise<ExactNpmVersionState>;

interface ReleaseTagDependencies {
  lookupNpmVersionState: ExactNpmVersionLookup;
  runGit: (args: string[], cwd: string) => Promise<GitCommandResult>;
  detectRepo: (cwd: string) => Promise<GitContext | null>;
  readPackageManifest: (repoRoot: string) => Promise<{
    name: string;
    version: string;
  }>;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  cwd: string;
}

export interface ReleaseTagExecutionResult {
  exitCode: 0 | 1;
  message: string;
  stream: "stdout" | "stderr";
}

interface TagState {
  sha: string | null;
  error: boolean;
}

function getGitEnv(): NodeJS.ProcessEnv {
  const { GIT_DIR: _gitDir, GIT_WORK_TREE: _gitWorkTree, ...cleanEnv } = process.env;
  return cleanEnv;
}

function parseArgs(argv: string[]): ParsedArgs {
  let force = false;
  let help = false;

  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    return { force, help, unknownArg: arg };
  }

  return { force, help, unknownArg: null };
}

function isStableSemver(version: string): boolean {
  return STABLE_SEMVER_REGEX.test(version);
}

function isStableReleaseTag(tag: string): boolean {
  return STABLE_RELEASE_TAG_REGEX.test(tag);
}

function success(message: string): ReleaseTagExecutionResult {
  return { exitCode: 0, message, stream: "stdout" };
}

function failure(message: string): ReleaseTagExecutionResult {
  return { exitCode: 1, message, stream: "stderr" };
}

async function runGitCommand(args: string[], cwd: string): Promise<GitCommandResult> {
  const gitProcess = Bun.spawn(["git", ...args], {
    cwd,
    env: getGitEnv(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    gitProcess.exited,
    new Response(gitProcess.stdout).text(),
    new Response(gitProcess.stderr).text(),
  ]);

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

async function detectGitRepo(cwd: string): Promise<GitContext | null> {
  const result = await runGitCommand(["rev-parse", "--show-toplevel"], cwd);
  if (result.exitCode !== 0) return null;
  if (!result.stdout) return null;

  return {
    workTree: result.stdout,
  };
}

async function readRootPackageManifest(
  repoRoot: string,
): Promise<{ name: string; version: string }> {
  const packagePath = resolve(repoRoot, "package.json");
  const rawManifest = await readFile(packagePath, "utf-8");
  const parsedManifest = JSON.parse(rawManifest) as {
    name?: unknown;
    version?: unknown;
  };

  if (
    typeof parsedManifest.name !== "string" ||
    typeof parsedManifest.version !== "string"
  ) {
    throw new Error("package.json must include string name and version fields.");
  }

  return {
    name: parsedManifest.name,
    version: parsedManifest.version,
  };
}

function parseRemoteTagSha(tag: string, stdout: string): string | null {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return null;

  let directSha: string | null = null;
  let peeledSha: string | null = null;

  for (const line of lines) {
    const [sha, ref] = line.split(/\s+/, 2);
    if (!sha || !ref) continue;

    if (ref === `refs/tags/${tag}`) {
      directSha = sha;
      continue;
    }

    if (ref === `refs/tags/${tag}^{}`) {
      peeledSha = sha;
    }
  }

  return peeledSha ?? directSha;
}

async function getLocalTagState(
  runGit: ReleaseTagDependencies["runGit"],
  cwd: string,
  tag: string,
): Promise<TagState> {
  const result = await runGit(
    ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`],
    cwd,
  );

  if (result.exitCode !== 0) {
    return { sha: null, error: false };
  }

  if (!result.stdout) {
    return { sha: null, error: true };
  }

  return { sha: result.stdout, error: false };
}

async function getRemoteTagState(
  runGit: ReleaseTagDependencies["runGit"],
  cwd: string,
  tag: string,
): Promise<TagState> {
  const result = await runGit(
    ["ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
    cwd,
  );

  if (result.exitCode !== 0) {
    return { sha: null, error: true };
  }

  return { sha: parseRemoteTagSha(tag, result.stdout), error: false };
}

export const lookupExactNpmVersionState: ExactNpmVersionLookup = async (
  packageName,
  version,
  signal,
) => {
  const trimmedVersion = version.trim();
  if (!isStableSemver(trimmedVersion)) {
    return {
      state: "indeterminate-error",
      reason: "invalid-version:exact-lookup-requires-stable-semver",
    };
  }

  const encodedName = packageName.startsWith("@")
    ? `@${encodeURIComponent(packageName.slice(1))}`
    : encodeURIComponent(packageName);
  const encodedVersion = encodeURIComponent(trimmedVersion);
  const lookupUrl = `${NPM_REGISTRY_BASE}/${encodedName}/${encodedVersion}`;

  try {
    const lookupSignal = signal ?? AbortSignal.timeout(NPM_LOOKUP_TIMEOUT_MS);
    const response = await fetch(lookupUrl, {
      signal: lookupSignal,
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) {
      return { state: "missing" };
    }

    if (!response.ok) {
      return {
        state: "indeterminate-error",
        reason: `http-${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      name?: unknown;
      version?: unknown;
    };

    if (payload.name !== packageName || payload.version !== trimmedVersion) {
      return {
        state: "indeterminate-error",
        reason: "mismatched-response",
      };
    }

    return { state: "published" };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        return {
          state: "indeterminate-error",
          reason: "timeout",
        };
      }

      return {
        state: "indeterminate-error",
        reason: error.message,
      };
    }

    return {
      state: "indeterminate-error",
      reason: String(error),
    };
  }
};

export async function executeReleaseTag(
  options: { force: boolean },
  partialDeps: Partial<ReleaseTagDependencies> = {},
): Promise<ReleaseTagExecutionResult> {
  const deps: ReleaseTagDependencies = {
    lookupNpmVersionState: lookupExactNpmVersionState,
    runGit: runGitCommand,
    detectRepo: detectGitRepo,
    readPackageManifest: readRootPackageManifest,
    stdout: (message) => process.stdout.write(`${message}\n`),
    stderr: (message) => process.stderr.write(`${message}\n`),
    cwd: process.cwd(),
    ...partialDeps,
  };

  const gitContext = await deps.detectRepo(deps.cwd);
  if (!gitContext) {
    return failure(MESSAGE_NOT_GIT_REPO);
  }

  let manifest: { name: string; version: string };
  try {
    manifest = await deps.readPackageManifest(gitContext.workTree);
  } catch {
    return failure("Could not read package.json; aborting without tag changes.");
  }

  if (!isStableSemver(manifest.version)) {
    return failure(MESSAGE_INVALID_VERSION);
  }

  const releaseTag = `v${manifest.version}`;
  if (!isStableReleaseTag(releaseTag)) {
    return failure(MESSAGE_INVALID_TAG);
  }

  const workingTreeState = await deps.runGit(
    ["status", "--porcelain", "--untracked-files=normal"],
    gitContext.workTree,
  );
  if (workingTreeState.exitCode !== 0) {
    return failure("Failed to inspect working tree state; aborting without tag changes.");
  }
  if (workingTreeState.stdout !== "") {
    return failure("Working tree must be clean before creating a release tag.");
  }

  const fetchResult = await deps.runGit(
    ["fetch", "origin", "--prune", "--tags"],
    gitContext.workTree,
  );
  if (fetchResult.exitCode !== 0) {
    return failure("Failed to refresh refs from origin; aborting without tag changes.");
  }

  const refreshOriginHeadResult = await deps.runGit(
    ["remote", "set-head", "origin", "--auto"],
    gitContext.workTree,
  );
  if (refreshOriginHeadResult.exitCode !== 0) {
    return failure(MESSAGE_ORIGIN_HEAD_UNRESOLVED);
  }

  const originHeadResult = await deps.runGit(
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
    gitContext.workTree,
  );
  if (originHeadResult.exitCode !== 0 || !originHeadResult.stdout.startsWith("origin/")) {
    return failure(MESSAGE_ORIGIN_HEAD_UNRESOLVED);
  }

  const defaultBranch = originHeadResult.stdout.slice("origin/".length);
  if (!defaultBranch) {
    return failure(MESSAGE_ORIGIN_HEAD_UNRESOLVED);
  }

  const headResult = await deps.runGit(["rev-parse", "HEAD"], gitContext.workTree);
  const defaultHeadResult = await deps.runGit(
    ["rev-parse", `refs/remotes/origin/${defaultBranch}`],
    gitContext.workTree,
  );
  if (headResult.exitCode !== 0 || defaultHeadResult.exitCode !== 0) {
    return failure(MESSAGE_ORIGIN_HEAD_UNRESOLVED);
  }

  const headSha = headResult.stdout;
  if (headSha !== defaultHeadResult.stdout) {
    return failure(
      `HEAD must exactly match origin/${defaultBranch} to create a release tag; aborting without tag changes.`,
    );
  }

  const npmState = await deps.lookupNpmVersionState(manifest.name, manifest.version);
  if (npmState.state === "published") {
    return failure(
      `Version ${manifest.name}@${manifest.version} is already published on npm; bump package.json before tagging.`,
    );
  }
  if (npmState.state === "indeterminate-error") {
    return failure(MESSAGE_NPM_CHECK_FAILED);
  }

  const [localTagState, remoteTagState] = await Promise.all([
    getLocalTagState(deps.runGit, gitContext.workTree, releaseTag),
    getRemoteTagState(deps.runGit, gitContext.workTree, releaseTag),
  ]);
  if (localTagState.error || remoteTagState.error) {
    return failure(
      `Could not inspect tag state for ${releaseTag}; aborting without tag changes.`,
    );
  }

  if (localTagState.sha && localTagState.sha !== headSha) {
    return failure(
      `Local tag ${releaseTag} points to a different commit; aborting without tag changes.`,
    );
  }

  if (remoteTagState.sha && remoteTagState.sha !== headSha) {
    return failure(
      `Remote tag ${releaseTag} points to a different commit; aborting without tag changes.`,
    );
  }

  if (remoteTagState.sha) {
    return failure(
      `Remote tag ${releaseTag} already exists on origin; aborting without tag changes.`,
    );
  }

  if (localTagState.sha) {
    if (!options.force) {
      return failure(
        `Local tag ${releaseTag} already exists; rerun with --force to push the existing tag.`,
      );
    }

    const retryNpmState = await deps.lookupNpmVersionState(
      manifest.name,
      manifest.version,
    );
    if (retryNpmState.state === "published") {
      return failure(
        `Version ${manifest.name}@${manifest.version} is already published on npm; bump package.json before tagging.`,
      );
    }
    if (retryNpmState.state === "indeterminate-error") {
      return failure(MESSAGE_NPM_CHECK_FAILED);
    }

    const retryRemoteTagState = await getRemoteTagState(
      deps.runGit,
      gitContext.workTree,
      releaseTag,
    );
    if (retryRemoteTagState.error) {
      return failure(
        `Could not inspect tag state for ${releaseTag}; aborting without tag changes.`,
      );
    }
    if (retryRemoteTagState.sha) {
      return failure(
        `Remote tag ${releaseTag} already exists on origin; aborting without tag changes.`,
      );
    }

    const pushExistingTagResult = await deps.runGit(
      ["push", "origin", `refs/tags/${releaseTag}`],
      gitContext.workTree,
    );
    if (pushExistingTagResult.exitCode !== 0) {
      return failure(
        `Failed to push existing local release tag ${releaseTag}; aborting without tag changes.`,
      );
    }

    return success(`Pushed existing local release tag ${releaseTag}.`);
  }

  const createTagResult = await deps.runGit(["tag", releaseTag], gitContext.workTree);
  if (createTagResult.exitCode !== 0) {
    return failure(
      `Failed to create local release tag ${releaseTag}; aborting without tag changes.`,
    );
  }

  const pushTagResult = await deps.runGit(
    ["push", "origin", `refs/tags/${releaseTag}`],
    gitContext.workTree,
  );
  if (pushTagResult.exitCode !== 0) {
    return failure(
      `Created local tag ${releaseTag} but failed to push to origin; rerun with --force after fixing the push problem.`,
    );
  }

  return success(`Created and pushed release tag ${releaseTag}.`);
}

export async function runReleaseTagCli(
  argv: string[],
  deps: Partial<ReleaseTagDependencies> = {},
): Promise<number> {
  const parsedArgs = parseArgs(argv);

  if (parsedArgs.help) {
    const stdout =
      deps.stdout ?? ((message: string) => process.stdout.write(`${message}\n`));
    stdout(USAGE_TEXT);
    return 0;
  }

  if (parsedArgs.unknownArg) {
    const stderr =
      deps.stderr ?? ((message: string) => process.stderr.write(`${message}\n`));
    stderr(`Unknown argument: ${parsedArgs.unknownArg}`);
    stderr(USAGE_TEXT);
    return 1;
  }

  const executionResult = await executeReleaseTag({ force: parsedArgs.force }, deps);
  if (executionResult.stream === "stdout") {
    (deps.stdout ?? ((message: string) => process.stdout.write(`${message}\n`)))(
      executionResult.message,
    );
  } else {
    (deps.stderr ?? ((message: string) => process.stderr.write(`${message}\n`)))(
      executionResult.message,
    );
  }

  return executionResult.exitCode;
}

if (import.meta.main) {
  const exitCode = await runReleaseTagCli(process.argv.slice(2));
  process.exit(exitCode);
}
