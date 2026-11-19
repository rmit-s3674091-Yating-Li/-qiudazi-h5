import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const HEAD_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_PATH = /^apps\/wechat-mini\/[A-Za-z0-9_./-]+$/;
const MAX_HANDOFF_BYTES = 512_000;

function field(source, name) {
  const matches = [
    ...source.matchAll(new RegExp(`^${name}=([^\\r\\n]+)\\s*$`, "gm")),
  ];
  if (matches.length > 1) throw new Error(`DUPLICATE_${name}`);
  return matches[0]?.[1]?.trim() ?? null;
}

/** Parse without executing handoff content. A digest is required for an automatic integrity PASS. */
export function parsePatchHandoff(source) {
  if (
    typeof source !== "string" ||
    Buffer.byteLength(source) > MAX_HANDOFF_BYTES
  )
    throw new Error("INVALID_HANDOFF_SIZE");
  const packageId = field(source, "PATCH_PACKAGE_ID");
  const status = field(source, "STATUS");
  const baseHead = field(source, "BASE_EXACT_HEAD");
  const declaredDigest = field(source, "PATCH_SHA256");
  if (!packageId || !/^[A-Za-z0-9_-]{8,160}$/.test(packageId))
    throw new Error("INVALID_PACKAGE_ID");
  if (status !== "CHAT_WRITE_REQUIRED") throw new Error("NOT_PENDING");
  if (baseHead !== null && !HEAD_PATTERN.test(baseHead))
    throw new Error("INVALID_BASE_HEAD");
  if (declaredDigest !== null && !DIGEST_PATTERN.test(declaredDigest))
    throw new Error("INVALID_DIGEST");

  const blocks = [...source.matchAll(/^```diff\r?\n([\s\S]*?)^```\s*$/gm)];
  if (blocks.length !== 1) throw new Error("EXPECTED_ONE_DIFF_BLOCK");
  const diff = blocks[0][1];
  if (diff.includes("\r")) throw new Error("CRLF_DIFF_NOT_SUPPORTED");
  const canonicalDiff = diff.endsWith("\n") ? diff : `${diff}\n`;
  const digest = createHash("sha256").update(canonicalDiff).digest("hex");
  if (declaredDigest && declaredDigest !== digest)
    throw new Error("PATCH_DIGEST_MISMATCH");
  if (
    /^(?:GIT binary patch|Binary files |rename (?:from|to) |copy (?:from|to) |delete file mode )/m.test(
      diff,
    )
  )
    throw new Error("UNSUPPORTED_PATCH_OPERATION");
  const gitHeaders = [...diff.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)];
  const minusHeaders = [...diff.matchAll(/^--- (\S+)$/gm)];
  const plusHeaders = [...diff.matchAll(/^\+\+\+ (\S+)$/gm)];
  if (!plusHeaders.length || minusHeaders.length !== plusHeaders.length)
    throw new Error("MALFORMED_DIFF_FILE_HEADERS");
  if (gitHeaders.length && gitHeaders.length !== plusHeaders.length)
    throw new Error("MALFORMED_GIT_FILE_HEADERS");
  const files = [];
  const warnings = [];
  if (!gitHeaders.length) warnings.push("LEGACY_NO_GIT_FILE_HEADERS");
  for (let i = 0; i < plusHeaders.length; i += 1) {
    const from = minusHeaders[i][1];
    const to = plusHeaders[i][1];
    if (!to.startsWith("b/")) throw new Error("UNSAFE_PATCH_CONTENT_PATH");
    const path = to.slice(2);
    if (
      !SAFE_PATH.test(path) ||
      path.split("/").some((segment) => segment === "." || segment === "..") ||
      path.includes("//") ||
      path.includes("\\")
    )
      throw new Error("UNSAFE_PATCH_PATH");
    if (from !== "/dev/null" && from !== `a/${path}`)
      throw new Error("UNSAFE_PATCH_CONTENT_PATH");
    if (gitHeaders.length) {
      const [rawFrom, rawTo] = gitHeaders[i].slice(1);
      if (rawTo !== path) throw new Error("UNSAFE_PATCH_PATH");
      if (rawFrom !== path) {
        if (from !== "/dev/null") throw new Error("UNSAFE_PATCH_PATH");
        warnings.push("NONCANONICAL_GIT_FROM_PATH");
      }
    }
    if (files.includes(path)) throw new Error("DUPLICATE_PATCH_PATH");
    files.push(path);
  }
  for (const [, mode] of diff.matchAll(/^new file mode (\d+)$/gm)) {
    if (mode !== "100644") throw new Error("UNSAFE_FILE_MODE");
  }
  return {
    packageId,
    baseHead,
    digest,
    hasDeclaredDigest: declaredDigest !== null,
    files,
    diff: canonicalDiff,
    warnings: [
      ...(baseHead === null ? ["LEGACY_MISSING_EXACT_HEAD"] : []),
      ...(declaredDigest === null ? ["LEGACY_MISSING_DIGEST"] : []),
      ...warnings,
    ],
  };
}

function git(repoDir, args, input) {
  const result = spawnSync("git", args, {
    cwd: repoDir,
    input,
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 512_000,
    shell: false,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

/** Never applies a patch. Independent --check is NOT a combined-batch integration proof. */
export function preflightHandoffBatch(repoDir, handoffDir) {
  const repo = resolve(repoDir);
  const directory = resolve(handoffDir);
  const head = git(repo, ["rev-parse", "HEAD"]);
  const branch = git(repo, ["symbolic-ref", "--short", "HEAD"]);
  if (!head || !HEAD_PATTERN.test(head))
    throw new Error("GIT_HEAD_UNAVAILABLE");
  if (branch !== "feature/v8-confirmed-20261011")
    throw new Error("WRONG_DEVELOPMENT_BRANCH");
  const dirty = git(repo, ["status", "--porcelain", "--untracked-files=no"]);
  if (dirty === null || dirty !== "") throw new Error("TRACKED_WORKTREE_DIRTY");
  if (lstatSync(directory).isSymbolicLink())
    throw new Error("SYMLINK_HANDOFF_DIR");
  const names = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith(".md"))
    .map((entry) => {
      if (!entry.isFile() || entry.isSymbolicLink())
        throw new Error("UNSAFE_HANDOFF_ENTRY");
      return entry.name;
    })
    .sort();
  if (names.length === 0) throw new Error("NO_HANDOFFS");
  const packages = [];
  const seenIds = new Set();
  const seenPaths = new Set();
  for (const name of names) {
    const parsed = parsePatchHandoff(
      readFileSync(join(directory, name), "utf8"),
    );
    if (seenIds.has(parsed.packageId)) throw new Error("DUPLICATE_PACKAGE_ID");
    seenIds.add(parsed.packageId);
    if (parsed.baseHead && parsed.baseHead !== head)
      throw new Error("STALE_PACKAGE_HEAD");
    for (const path of parsed.files) {
      if (seenPaths.has(path)) throw new Error("OVERLAPPING_TARGET_FILES");
      seenPaths.add(path);
    }
    // Git receives only the extracted diff via stdin; --check makes no file changes.
    if (
      git(
        repo,
        ["apply", "--check", "--whitespace=error", "-"],
        parsed.diff,
      ) === null
    )
      throw new Error(`GIT_APPLY_CHECK_FAILED:${name}`);
    packages.push({
      filename: name,
      packageId: parsed.packageId,
      files: parsed.files,
      sha256: parsed.digest,
      warnings: parsed.warnings,
      independentlyApplies: true,
    });
  }
  return {
    head,
    branch,
    packages,
    readiness: packages.some((p) => p.warnings.length)
      ? "REVIEW_REQUIRED"
      : "PRECHECK_READY",
    batchApplied: false,
    testsRun: false,
    sessionBridge: "SESSION_BRIDGE_UNPROVEN",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--repo" || args[2] !== "--handoffs") {
    console.error(
      "Usage: node scripts/verify-handoff-patches.mjs --repo <git-repo> --handoffs <folder>",
    );
    process.exitCode = 2;
  } else {
    try {
      const result = preflightHandoffBatch(args[1], args[3]);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.readiness === "PRECHECK_READY" ? 0 : 3;
    } catch (error) {
      console.error(
        `PATCH_PREFLIGHT_BLOCKED:${error instanceof Error ? error.message : "UNKNOWN"}`,
      );
      process.exitCode = 2;
    }
  }
}
