import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parsePatchHandoff } from "./verify-handoff-patches.mjs";

const BRANCH = "feature/v8-confirmed-20261011";
const SHA = /^[0-9a-f]{40}$/;
const MAX_PACKAGES = 32;
const MAX_BUFFER = 2 * 1024 * 1024;

function run(command, args, { cwd, input, timeout = 30_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    input,
    encoding: "utf8",
    shell: false,
    timeout,
    maxBuffer: MAX_BUFFER,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_NO_REPLACE_OBJECTS: "1",
    },
  });
  return result.error ? { status: null, stdout: "" } : result;
}

function git(cwd, args, input) {
  const result = run("git", args, { cwd, input });
  if (result.status !== 0) throw new Error(`GIT_OPERATION_FAILED:${args[0]}`);
  return result.stdout.trim();
}

function gitPaths(cwd, args) {
  const separator = args.indexOf("--");
  const withNull =
    separator < 0
      ? [...args, "-z"]
      : [...args.slice(0, separator), "-z", ...args.slice(separator)];
  const result = run("git", withNull, { cwd });
  if (result.status !== 0) throw new Error(`GIT_OPERATION_FAILED:${args[0]}`);
  return result.stdout.split("\0").filter(Boolean);
}

function listHandoffs(folder) {
  if (lstatSync(folder).isSymbolicLink())
    throw new Error("SYMLINK_HANDOFF_DIRECTORY");
  const entries = readdirSync(folder, { withFileTypes: true });
  const markdown = entries.filter((entry) => entry.name.endsWith(".md"));
  if (!markdown.length || markdown.length > MAX_PACKAGES)
    throw new Error("INVALID_HANDOFF_COUNT");
  if (markdown.some((entry) => !entry.isFile() || entry.isSymbolicLink()))
    throw new Error("UNSAFE_HANDOFF_ENTRY");
  return markdown.map((entry) => entry.name).sort();
}

/**
 * Runs a combined git-apply rehearsal in a disposable LOCAL clone. No network,
 * no repository writes, no patch code execution, and no Supabase/WeChat calls.
 * Review and run G1 separately; this is NOT an authentication or build gate.
 */
export function previewHandoffBatch(repoDir, handoffDir, baseSha) {
  if (!SHA.test(baseSha)) throw new Error("INVALID_BASE_SHA");
  const repo = realpathSync(resolve(repoDir));
  if (lstatSync(resolve(handoffDir)).isSymbolicLink())
    throw new Error("SYMLINK_HANDOFF_DIRECTORY");
  const handoffs = realpathSync(resolve(handoffDir));
  const repoRoot = realpathSync(git(repo, ["rev-parse", "--show-toplevel"]));
  if (repoRoot !== repo) throw new Error("REPO_ROOT_REQUIRED");
  if (git(repo, ["symbolic-ref", "--short", "HEAD"]) !== BRANCH)
    throw new Error("WRONG_DEVELOPMENT_BRANCH");
  if (git(repo, ["status", "--porcelain=v1", "--untracked-files=no"]) !== "")
    throw new Error("TRACKED_WORKTREE_DIRTY");
  const head = git(repo, ["rev-parse", "HEAD"]);
  if (!SHA.test(head)) throw new Error("INVALID_HEAD");
  if (
    run("git", ["merge-base", "--is-ancestor", baseSha, head], { cwd: repo })
      .status !== 0
  )
    throw new Error("BASE_NOT_ANCESTOR_OF_HEAD");

  const seenPaths = new Set();
  const seenIds = new Set();
  const packages = [];
  for (const name of listHandoffs(handoffs)) {
    const parsed = parsePatchHandoff(
      readFileSync(join(handoffs, name), "utf8"),
    );
    if (parsed.baseHead && parsed.baseHead !== baseSha) {
      const withinRange =
        run("git", ["merge-base", "--is-ancestor", baseSha, parsed.baseHead], {
          cwd: repo,
        }).status === 0 &&
        run("git", ["merge-base", "--is-ancestor", parsed.baseHead, head], {
          cwd: repo,
        }).status === 0;
      if (!withinRange) throw new Error(`INCONSISTENT_PACKAGE_BASE:${name}`);
    }
    if (seenIds.has(parsed.packageId)) throw new Error("DUPLICATE_PACKAGE_ID");
    seenIds.add(parsed.packageId);
    for (const path of parsed.files) {
      if (seenPaths.has(path))
        throw new Error(`OVERLAPPING_PATCH_TARGET:${path}`);
      seenPaths.add(path);
    }
    packages.push({ filename: name, parsed });
  }
  const upstreamChanges = new Set(
    gitPaths(repo, [
      "diff",
      "--name-only",
      "--no-renames",
      "--diff-filter=ACDMRTUXB",
      `${baseSha}..${head}`,
    ]),
  );
  const overlaps = [...seenPaths].filter((path) => upstreamChanges.has(path));
  if (overlaps.length)
    throw new Error(`HEAD_TARGET_OVERLAP:${overlaps.join(",")}`);

  const temp = mkdtempSync(join(tmpdir(), "qdmp-batch-preview-"));
  const clone = join(temp, "checkout");
  try {
    // --local copies only the local Git object store; no remote fetch or push.
    const cloned = run(
      "git",
      [
        "clone",
        "--quiet",
        "--local",
        "--no-hardlinks",
        "--no-checkout",
        repo,
        clone,
      ],
      {
        timeout: 90_000,
      },
    );
    if (cloned.status !== 0) throw new Error("TEMP_LOCAL_CLONE_FAILED");
    git(clone, ["checkout", "--quiet", "--detach", head]);
    for (const { filename, parsed } of packages) {
      const check = run(
        "git",
        ["apply", "--check", "--whitespace=error", "-"],
        {
          cwd: clone,
          input: parsed.diff,
        },
      );
      if (check.status !== 0)
        throw new Error(`SEQUENTIAL_APPLY_CHECK_FAILED:${filename}`);
      const apply = run("git", ["apply", "--whitespace=error", "-"], {
        cwd: clone,
        input: parsed.diff,
      });
      if (apply.status !== 0)
        throw new Error(`SEQUENTIAL_APPLY_FAILED:${filename}`);
    }
    git(clone, ["add", "-N", "--", "apps/wechat-mini"]);
    const whitespace = run(
      "git",
      ["diff", "--check", "--", "apps/wechat-mini"],
      { cwd: clone },
    );
    if (whitespace.status !== 0)
      throw new Error("COMBINED_DIFF_WHITESPACE_FAILED");
    const actual = new Set(
      gitPaths(clone, ["diff", "--name-only", "--", "apps/wechat-mini"]),
    );
    if (
      actual.size !== seenPaths.size ||
      [...seenPaths].some((path) => !actual.has(path))
    )
      throw new Error("COMBINED_TARGET_MISMATCH");
    const advanced = head !== baseSha;
    const warnings = packages.flatMap(({ filename, parsed }) => [
      ...parsed.warnings.map((warning) => `${filename}:${warning}`),
      ...(parsed.baseHead && parsed.baseHead !== baseSha
        ? [`${filename}:PACKAGE_BASE_ADVANCED_WITHIN_ANCESTRY`]
        : []),
    ]);
    if (advanced)
      warnings.push("HEAD_ADVANCED_WITHOUT_TARGET_OVERLAP_REVIEW_REQUIRED");
    return {
      baseSha,
      observedHead: head,
      branch: BRANCH,
      packages: packages.map(({ filename, parsed }) => ({
        filename,
        packageId: parsed.packageId,
        files: parsed.files,
        digest: createHash("sha256").update(parsed.diff).digest("hex"),
        warnings: parsed.warnings,
      })),
      changedPaths: [...actual].sort(),
      readiness: warnings.length
        ? "REVIEW_REQUIRED"
        : "TEMP_MERGE_PREVIEW_PASSED",
      warnings,
      temporaryCloneDeleted: true,
      originalRepoWritten: false,
      testsRun: false,
      taroBuildRun: false,
      sessionBridge: "SESSION_BRIDGE_UNPROVEN",
      realWechatLogin: false,
      releaseApproved: false,
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (
    args.length !== 6 ||
    args[0] !== "--repo" ||
    args[2] !== "--handoffs" ||
    args[4] !== "--base"
  ) {
    console.error(
      "Usage: node scripts/preview-handoff-batch.mjs --repo <repo> --handoffs <folder> --base <40-char-sha>",
    );
    process.exitCode = 2;
  } else {
    try {
      const report = previewHandoffBatch(args[1], args[3], args[5]);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode =
        report.readiness === "TEMP_MERGE_PREVIEW_PASSED" ? 0 : 3;
    } catch (error) {
      console.error(
        `TEMP_MERGE_PREVIEW_BLOCKED:${error instanceof Error ? error.message : "UNKNOWN"}`,
      );
      process.exitCode = 2;
    }
  }
}
