import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  executeReleaseTag,
  type ReleaseTagExecutionResult,
} from "../scripts/release-tag";

interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface TestRepo {
  rootDir: string;
  remoteDir: string;
  workDir: string;
}

const cleanupDirs = new Set<string>();

function getGitEnv(): NodeJS.ProcessEnv {
  const { GIT_DIR: _gitDir, GIT_WORK_TREE: _gitWorkTree, ...cleanEnv } = process.env;
  return cleanEnv;
}

afterEach(async () => {
  const cleanupTasks = Array.from(cleanupDirs, (dir) =>
    rm(dir, { recursive: true, force: true }),
  );
  await Promise.all(cleanupTasks);
  cleanupDirs.clear();
});

async function git(cwd: string, args: string[]): Promise<GitResult> {
  const processHandle = Bun.spawn(["git", ...args], {
    cwd,
    env: getGitEnv(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    processHandle.exited,
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
  ]);

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

async function gitOrThrow(cwd: string, args: string[]): Promise<string> {
  const result = await git(cwd, args);
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (exit=${result.exitCode})\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }

  return result.stdout;
}

async function setupRepo(version = "1.2.3"): Promise<TestRepo> {
  const rootDir = await mkdtemp(join(tmpdir(), "gmlp-release-tag-"));
  const remoteDir = join(rootDir, "remote.git");
  const workDir = join(rootDir, "work");

  cleanupDirs.add(rootDir);

  await mkdir(workDir, { recursive: true });
  await gitOrThrow(rootDir, ["init", "--bare", remoteDir]);
  await gitOrThrow(workDir, ["init", "-b", "main"]);
  await gitOrThrow(workDir, ["config", "user.email", "test@example.com"]);
  await gitOrThrow(workDir, ["config", "user.name", "Test User"]);

  await writeFile(
    join(workDir, "package.json"),
    JSON.stringify(
      {
        name: "google-maps-link-parser",
        version,
      },
      null,
      2,
    ),
  );

  await gitOrThrow(workDir, ["add", "package.json"]);
  await gitOrThrow(workDir, ["commit", "-m", "chore: seed release-tag test repo"]);
  await gitOrThrow(workDir, ["remote", "add", "origin", remoteDir]);
  await gitOrThrow(workDir, ["push", "-u", "origin", "main"]);

  await gitOrThrow(remoteDir, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  await gitOrThrow(workDir, ["fetch", "origin", "--prune", "--tags"]);

  return { rootDir, remoteDir, workDir };
}

function parseRemoteTagSha(tag: string, stdout: string): string | null {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  let directSha: string | null = null;
  let peeledSha: string | null = null;

  for (const line of lines) {
    const [sha, ref] = line.split(/\s+/, 2);
    if (!sha || !ref) {
      continue;
    }

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

async function getHeadSha(repo: TestRepo): Promise<string> {
  return gitOrThrow(repo.workDir, ["rev-parse", "HEAD"]);
}

async function getLocalTagSha(repo: TestRepo, tag: string): Promise<string | null> {
  const result = await git(repo.workDir, [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/tags/${tag}^{commit}`,
  ]);
  if (result.exitCode !== 0 || !result.stdout) {
    return null;
  }

  return result.stdout;
}

async function getRemoteTagSha(repo: TestRepo, tag: string): Promise<string | null> {
  const result = await git(repo.workDir, [
    "ls-remote",
    "--tags",
    "origin",
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`ls-remote failed: ${result.stderr}`);
  }

  return parseRemoteTagSha(tag, result.stdout);
}

function missingNpmLookup(): Promise<{ state: "missing" }> {
  return Promise.resolve({ state: "missing" });
}

async function runReleaseTag(
  repo: TestRepo,
  force = false,
): Promise<ReleaseTagExecutionResult> {
  return executeReleaseTag(
    { force },
    {
      cwd: repo.workDir,
      lookupNpmVersionState: missingNpmLookup,
    },
  );
}

describe("release-tag helper", () => {
  test("creates and pushes a fresh release tag", async () => {
    const repo = await setupRepo("1.2.3");
    const tag = "v1.2.3";

    const result = await runReleaseTag(repo);

    expect(result.exitCode).toBe(0);
    expect(result.message).toBe("Created and pushed release tag v1.2.3.");

    const headSha = await getHeadSha(repo);
    expect(await getLocalTagSha(repo, tag)).toBe(headSha);
    expect(await getRemoteTagSha(repo, tag)).toBe(headSha);
  });

  test("rejects non-stable package versions", async () => {
    const repo = await setupRepo("1.2.3-beta.1");

    const result = await runReleaseTag(repo);

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe(
      "package.json version must be a stable semver release; aborting without tag changes.",
    );
    expect(await getLocalTagSha(repo, "v1.2.3-beta.1")).toBeNull();
  });

  test("rejects dirty working trees", async () => {
    const repo = await setupRepo("1.2.3");

    await writeFile(join(repo.workDir, "dirty.txt"), "dirty");

    const result = await runReleaseTag(repo);

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe(
      "Working tree must be clean before creating a release tag.",
    );
    expect(await getLocalTagSha(repo, "v1.2.3")).toBeNull();
    expect(await getRemoteTagSha(repo, "v1.2.3")).toBeNull();
  });

  test("rejects when HEAD is ahead of origin default branch", async () => {
    const repo = await setupRepo("1.2.3");

    await writeFile(join(repo.workDir, "ahead.txt"), "ahead");
    await gitOrThrow(repo.workDir, ["add", "ahead.txt"]);
    await gitOrThrow(repo.workDir, ["commit", "-m", "chore: local ahead commit"]);

    const result = await runReleaseTag(repo);

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe(
      "HEAD must exactly match origin/main to create a release tag; aborting without tag changes.",
    );
    expect(await getLocalTagSha(repo, "v1.2.3")).toBeNull();
    expect(await getRemoteTagSha(repo, "v1.2.3")).toBeNull();
  });

  test("rejects already-published npm versions", async () => {
    const repo = await setupRepo("1.2.3");

    const result = await executeReleaseTag(
      { force: false },
      {
        cwd: repo.workDir,
        lookupNpmVersionState: () => Promise.resolve({ state: "published" }),
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe(
      "Version google-maps-link-parser@1.2.3 is already published on npm; bump package.json before tagging.",
    );
    expect(await getLocalTagSha(repo, "v1.2.3")).toBeNull();
    expect(await getRemoteTagSha(repo, "v1.2.3")).toBeNull();
  });

  test("allows --force to push an already-correct local tag", async () => {
    const repo = await setupRepo("1.2.3");
    const tag = "v1.2.3";

    await gitOrThrow(repo.workDir, ["tag", tag]);

    const withoutForce = await runReleaseTag(repo, false);
    expect(withoutForce.exitCode).toBe(1);
    expect(withoutForce.message).toBe(
      "Local tag v1.2.3 already exists; rerun with --force to push the existing tag.",
    );
    expect(await getRemoteTagSha(repo, tag)).toBeNull();

    const withForce = await runReleaseTag(repo, true);
    expect(withForce.exitCode).toBe(0);
    expect(withForce.message).toBe("Pushed existing local release tag v1.2.3.");

    const headSha = await getHeadSha(repo);
    expect(await getLocalTagSha(repo, tag)).toBe(headSha);
    expect(await getRemoteTagSha(repo, tag)).toBe(headSha);
  });

  test("rejects conflicting tag state", async () => {
    const repo = await setupRepo("1.2.3");
    const tag = "v1.2.3";

    const firstHead = await getHeadSha(repo);
    await writeFile(join(repo.workDir, "second.txt"), "second commit");
    await gitOrThrow(repo.workDir, ["add", "second.txt"]);
    await gitOrThrow(repo.workDir, ["commit", "-m", "chore: second commit"]);
    await gitOrThrow(repo.workDir, ["push", "origin", "main"]);

    await gitOrThrow(repo.workDir, ["tag", tag, firstHead]);
    await gitOrThrow(repo.workDir, ["push", "origin", `refs/tags/${tag}`]);
    await gitOrThrow(repo.workDir, ["tag", "-d", tag]);

    const result = await runReleaseTag(repo);

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe(
      "Local tag v1.2.3 points to a different commit; aborting without tag changes.",
    );
  });

  test("returns clear error when not in a git repository", async () => {
    const nonRepoDir = await mkdtemp(join(tmpdir(), "gmlp-release-tag-non-repo-"));
    cleanupDirs.add(nonRepoDir);

    const result = await executeReleaseTag(
      { force: false },
      {
        cwd: nonRepoDir,
        lookupNpmVersionState: missingNpmLookup,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe("Not a git repository; aborting without tag changes.");
  });

  test("surface npm registry ambiguity as fail-closed", async () => {
    const repo = await setupRepo("1.2.3");

    const result = await executeReleaseTag(
      { force: false },
      {
        cwd: repo.workDir,
        lookupNpmVersionState: () =>
          Promise.resolve({
            state: "indeterminate-error",
            reason: "timeout",
          }),
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe(
      "npm registry check failed; aborting without tag changes.",
    );
  });

  test("reports deterministic recovery message on tag push failure", async () => {
    const repo = await setupRepo("1.2.3");
    const hookPath = join(repo.remoteDir, "hooks", "pre-receive");

    await writeFile(
      hookPath,
      [
        "#!/bin/sh",
        "while read old_sha new_sha ref_name; do",
        '  if [ "$ref_name" = "refs/tags/v1.2.3" ]; then',
        "    echo 'rejecting tag push for test' >&2",
        "    exit 1",
        "  fi",
        "done",
        "exit 0",
        "",
      ].join("\n"),
    );
    await chmod(hookPath, 0o755);

    const firstResult = await runReleaseTag(repo);
    expect(firstResult.exitCode).toBe(1);
    expect(firstResult.message).toBe(
      "Created local tag v1.2.3 but failed to push to origin; rerun with --force after fixing the push problem.",
    );

    await rm(hookPath, { force: true });

    const retryResult = await runReleaseTag(repo, true);
    expect(retryResult.exitCode).toBe(0);
    expect(retryResult.message).toBe("Pushed existing local release tag v1.2.3.");
  });
});
