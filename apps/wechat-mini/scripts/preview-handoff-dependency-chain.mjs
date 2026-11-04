import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BRANCH = "feature/v8-confirmed-20261011";
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.md$/;
const SAFE_TARGET = /^apps\/wechat-mini\/[A-Za-z0-9_./-]+$/;
const MAX_HANDOFF_BYTES = 512_000;
const MAX_MANIFEST_BYTES = 32_768;
const MAX_PACKAGES = 32;

function field(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plain = [
    ...source.matchAll(new RegExp(`^${escaped}=([^\\r\\n]+)$`, "gm")),
  ];
  const markdown = [
    ...source.matchAll(
      new RegExp(`^\\s*-\\s*\\\`${escaped}\\\`:\\s*\\\`([^\\\`]+)\\\``, "gm"),
    ),
  ];
  const values = [...plain, ...markdown].map((match) => match[1].trim());
  if (values.length > 1) throw new Error(`DUPLICATE_FIELD:${name}`);
  return values[0] ?? null;
}

/** Accept the two observed handoff header layouts; never execute handoff prose. */
export function parseQueuedHandoff(source) {
  if (
    typeof source !== "string" ||
    Buffer.byteLength(source) > MAX_HANDOFF_BYTES ||
    source.includes("\0")
  )
    throw new Error("INVALID_HANDOFF_SIZE");
  const packageId = field(source, "PATCH_PACKAGE_ID");
  if (!packageId || !/^[A-Za-z0-9_-]{8,160}$/.test(packageId))
    throw new Error("INVALID_PACKAGE_ID");
  const status = field(source, "STATUS");
  if (
    status !== "CHAT_WRITE_REQUIRED" &&
    status !== "CHAT_WRITE_REQUIRED / NOT_APPLIED"
  )
    throw new Error("NOT_PENDING");
  const heads = ["BASE_EXACT_HEAD", "BASE_SHA", "BASE_HEAD"]
    .map((name) => field(source, name))
    .filter((value) => value !== null);
  if (heads.length !== 1 || !SHA.test(heads[0]))
    throw new Error("INVALID_BASE_HEAD");
  const declaredDigest = field(source, "PATCH_SHA256");
  if (!declaredDigest || !DIGEST.test(declaredDigest))
    throw new Error("MISSING_OR_INVALID_DIGEST");
  const blocks = [...source.matchAll(/^```diff\r?\n([\s\S]*?)^```\s*$/gm)];
  if (blocks.length !== 1) throw new Error("EXPECTED_ONE_DIFF_BLOCK");
  const diff = blocks[0][1];
  if (diff.includes("\r")) throw new Error("CRLF_DIFF_UNSUPPORTED");
  const canonical = diff.endsWith("\n") ? diff : `${diff}\n`;
  const digest = createHash("sha256").update(canonical).digest("hex");
  if (digest !== declaredDigest) throw new Error("PATCH_DIGEST_MISMATCH");
  if (
    /^(?:GIT binary patch|Binary files |rename |copy |old mode |new mode |deleted file mode |delete file mode |similarity index |dissimilarity index )/m.test(
      diff,
    )
  )
    throw new Error("UNSUPPORTED_PATCH_OPERATION");
  const sections = canonical.split(/(?=^diff --git )/m).filter(Boolean);
  if (!sections.length || !canonical.startsWith("diff --git "))
    throw new Error("GIT_DIFF_REQUIRED");
  const targets = [];
  for (const section of sections) {
    const header = section.match(/^diff --git a\/(\S+) b\/(\S+)$/m);
    const oldPath = section.match(/^--- (\S+)$/m);
    const newPath = section.match(/^\+\+\+ (\S+)$/m);
    if (!header || !oldPath || !newPath || !section.includes("\n@@ "))
      throw new Error("MALFORMED_PATCH_SECTION");
    const target = header[2];
    if (
      header[1] !== target ||
      newPath[1] !== `b/${target}` ||
      (oldPath[1] !== `a/${target}` && oldPath[1] !== "/dev/null") ||
      !SAFE_TARGET.test(target) ||
      target.includes("//") ||
      target.includes("\\") ||
      target.split("/").some((segment) => segment === "." || segment === "..")
    )
      throw new Error("UNSAFE_PATCH_TARGET");
    if (targets.includes(target)) throw new Error("DUPLICATE_PATCH_TARGET");
    const modes = [...section.matchAll(/^new file mode (\d+)$/gm)];
    if (modes.some((match) => match[1] !== "100644"))
      throw new Error("UNSAFE_NEW_FILE_MODE");
    if (oldPath[1] === "/dev/null" && modes.length !== 1)
      throw new Error("NEW_FILE_MODE_REQUIRED");
    const indices = [
      ...section.matchAll(/^index [a-f0-9]+\.\.[a-f0-9]+(?: (\d+))?$/gm),
    ];
    if (indices.some((match) => match[1] && match[1] !== "100644"))
      throw new Error("UNSAFE_INDEX_MODE");
    targets.push(target);
  }
  return { packageId, baseSha: heads[0], digest, diff: canonical, targets };
}

function run(command, args, cwd, input) {
  const result = spawnSync(command, args, {
    cwd,
    input,
    encoding: "utf8",
    shell: false,
    timeout: 45_000,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_NO_REPLACE_OBJECTS: "1",
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(`COMMAND_FAILED:${command}:${args[0]}`);
  return result.stdout.trim();
}

function git(cwd, ...args) {
  return run("git", args, cwd);
}

function safeRegularFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("UNSAFE_INPUT_FILE");
}

function checkTarget(repo, target) {
  let current = repo;
  for (const part of target.split("/")) {
    current = join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new Error("SYMLINK_PATCH_TARGET");
  }
  const tracked = git(repo, "ls-files", "--stage", "--", target);
  if (
    tracked &&
    tracked.split("\n").some((line) => !line.startsWith("100644 "))
  )
    throw new Error("UNSAFE_TRACKED_MODE");
}

/** Explicit dependency order, sequential git-apply rehearsal, no original repo writes. */
export function previewHandoffDependencyChain(
  repoDir,
  handoffDir,
  manifestPath,
) {
  const repo = resolve(repoDir);
  const handoffs = resolve(handoffDir);
  const manifestFile = resolve(manifestPath);
  if (lstatSync(repo).isSymbolicLink() || lstatSync(handoffs).isSymbolicLink())
    throw new Error("SYMLINK_INPUT_DIRECTORY");
  safeRegularFile(manifestFile);
  const manifestBytes = readFileSync(manifestFile);
  if (manifestBytes.length > MAX_MANIFEST_BYTES)
    throw new Error("MANIFEST_TOO_LARGE");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    manifest?.schemaVersion !== 1 ||
    !SHA.test(manifest.baseSha ?? "") ||
    !Array.isArray(manifest.packages) ||
    manifest.packages.length < 1 ||
    manifest.packages.length > MAX_PACKAGES
  )
    throw new Error("INVALID_MANIFEST");
  if (git(repo, "rev-parse", "--show-toplevel") !== repo)
    throw new Error("REPO_ROOT_REQUIRED");
  if (git(repo, "symbolic-ref", "--short", "HEAD") !== BRANCH)
    throw new Error("WRONG_BRANCH");
  const head = git(repo, "rev-parse", "HEAD");
  if (head !== manifest.baseSha) throw new Error("STALE_HEAD");
  if (git(repo, "status", "--porcelain", "--untracked-files=no"))
    throw new Error("TRACKED_WORKTREE_DIRTY");

  const packages = [];
  const seenIds = new Set();
  const seenFiles = new Set();
  const lastTouched = new Map();
  for (const entry of manifest.packages) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,40}$/.test(entry.id) ||
      typeof entry.file !== "string" ||
      !SAFE_NAME.test(entry.file) ||
      basename(entry.file) !== entry.file ||
      !DIGEST.test(entry.sha256 ?? "") ||
      !Array.isArray(entry.dependsOn) ||
      entry.dependsOn.some(
        (id) => typeof id !== "string" || !seenIds.has(id),
      ) ||
      seenIds.has(entry.id) ||
      seenFiles.has(entry.file)
    )
      throw new Error("INVALID_PACKAGE_ENTRY");
    const file = join(handoffs, entry.file);
    safeRegularFile(file);
    const parsed = parseQueuedHandoff(readFileSync(file, "utf8"));
    if (parsed.baseSha !== head || parsed.digest !== entry.sha256)
      throw new Error(`BASE_OR_DIGEST_MISMATCH:${entry.id}`);
    for (const target of parsed.targets) {
      const previous = lastTouched.get(target);
      if (previous && !entry.dependsOn.includes(previous))
        throw new Error(`UNDECLARED_OVERLAP:${entry.id}:${target}`);
      lastTouched.set(target, entry.id);
      checkTarget(repo, target);
      if (git(repo, "ls-files", "--others", "--exclude-standard", "--", target))
        throw new Error(`UNTRACKED_TARGET_COLLISION:${target}`);
    }
    packages.push({
      id: entry.id,
      file: entry.file,
      dependsOn: entry.dependsOn,
      ...parsed,
    });
    seenIds.add(entry.id);
    seenFiles.add(entry.file);
  }

  const temp = mkdtempSync(join(tmpdir(), "qdmp-ordered-preview-"));
  const clone = join(temp, "checkout");
  try {
    run(
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
      temp,
    );
    git(clone, "checkout", "--quiet", "--detach", head);
    for (const pkg of packages) {
      for (const target of pkg.targets) checkTarget(clone, target);
      run(
        "git",
        ["apply", "--check", "--whitespace=error", "-"],
        clone,
        pkg.diff,
      );
      run("git", ["apply", "--whitespace=error", "-"], clone, pkg.diff);
    }
    git(clone, "add", "-N", "--", "apps/wechat-mini");
    git(clone, "diff", "--check", "--", "apps/wechat-mini");
    const actual = git(clone, "diff", "--name-only", "--", "apps/wechat-mini")
      .split("\n")
      .filter(Boolean)
      .sort();
    const expected = [...lastTouched.keys()].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error("COMBINED_TARGET_MISMATCH");
    return {
      head,
      branch: BRANCH,
      readiness: "ORDERED_REHEARSAL_PASSED",
      packages: packages.map(({ id, file, dependsOn, digest, targets }) => ({
        id,
        file,
        dependsOn,
        digest,
        targets,
      })),
      changedPaths: actual,
      temporaryCloneDeleted: true,
      originalRepoWritten: false,
      testsRun: false,
      taroBuildRun: false,
      realAuth: "SESSION_BRIDGE_UNPROVEN",
      release: "NOT_AUTHORIZED",
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
    args[4] !== "--manifest"
  ) {
    console.error(
      "Usage: node scripts/preview-handoff-dependency-chain.mjs --repo <repo> --handoffs <dir> --manifest <json>",
    );
    process.exitCode = 2;
  } else {
    try {
      console.log(
        JSON.stringify(
          previewHandoffDependencyChain(args[1], args[3], args[5]),
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(
        `ORDERED_REHEARSAL_BLOCKED:${error instanceof Error ? error.message : "UNKNOWN"}`,
      );
      process.exitCode = 2;
    }
  }
}
