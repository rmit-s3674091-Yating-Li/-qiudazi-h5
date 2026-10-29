import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parsePatchHandoff } from "./verify-handoff-patches.mjs";
import { previewHandoffBatch } from "./preview-handoff-batch.mjs";

const MAX_HANDOFFS = 32;
const GIT_MODE = /^([0-9]{6}) [a-f0-9]{40,64} 0\t/;

function git(repo, args) {
  const result = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    shell: false,
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_NO_REPLACE_OBJECTS: "1",
    },
  });
  if (result.error || result.status !== 0)
    throw new Error("GIT_MODE_INSPECTION_FAILED");
  return result.stdout;
}

/** Only regular, non-executable 100644 file content changes are allowed. */
export function checkPatchModes(diff) {
  if (
    typeof diff !== "string" ||
    !diff.includes("--- ") ||
    !diff.includes("+++ ")
  )
    throw new Error("MODE_GUARD_INVALID_DIFF");
  const legacy = !diff.startsWith("diff --git ");
  const sections = legacy
    ? [diff]
    : diff.split(/(?=^diff --git )/m).filter(Boolean);
  for (const section of sections) {
    const header = section.split(/^@@ /m, 1)[0];
    if (/^(?:old mode|new mode|deleted file mode) /m.test(header))
      throw new Error("PATCH_MODE_CHANGE_FORBIDDEN");
    for (const match of header.matchAll(/^new file mode (\d+)$/gm)) {
      if (match[1] !== "100644") throw new Error("UNSAFE_NEW_FILE_MODE");
    }
    for (const match of header.matchAll(
      /^index [a-f0-9]+\.\.[a-f0-9]+(?: (\d+))?$/gm,
    )) {
      if (match[1] && match[1] !== "100644")
        throw new Error("UNSAFE_INDEX_MODE");
    }
    if (
      /^(?:similarity index|dissimilarity index|rename from|rename to|copy from|copy to) /m.test(
        header,
      )
    )
      throw new Error("UNSUPPORTED_PATCH_HEADER");
  }
  return { safe: true, policy: "REGULAR_NONEXECUTABLE_100644_ONLY", legacy };
}

function checkTargetModes(repo, targets) {
  for (const path of targets) {
    const segments = path.split("/");
    for (let i = 1; i <= segments.length; i += 1) {
      const prefix = segments.slice(0, i).join("/");
      const tracked = git(repo, ["ls-files", "--stage", "--", prefix]);
      if (tracked) {
        const lines = tracked.trimEnd().split("\n");
        if (
          lines.some(
            (line) => !GIT_MODE.test(line) || !line.startsWith("100644 "),
          )
        )
          throw new Error(`UNSAFE_TRACKED_TARGET_MODE:${prefix}`);
      }
    }
    const untracked = git(repo, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "--",
      path,
    ]);
    if (untracked.trim()) throw new Error(`UNTRACKED_TARGET_COLLISION:${path}`);
  }
}

/** Offline, read-only original repository: mode gate BEFORE disposable merge rehearsal. */
export function previewHandoffBatchSafe(repoDir, handoffDir, baseSha) {
  const repo = resolve(repoDir);
  const folder = resolve(handoffDir);
  if (lstatSync(folder).isSymbolicLink())
    throw new Error("SYMLINK_HANDOFF_DIRECTORY");
  const entries = readdirSync(folder, { withFileTypes: true }).filter((entry) =>
    entry.name.endsWith(".md"),
  );
  if (!entries.length || entries.length > MAX_HANDOFFS)
    throw new Error("INVALID_HANDOFF_COUNT");
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink()))
    throw new Error("UNSAFE_HANDOFF_ENTRY");
  const targets = new Set();
  for (const entry of entries) {
    const parsed = parsePatchHandoff(
      readFileSync(join(folder, entry.name), "utf8"),
    );
    checkPatchModes(parsed.diff);
    for (const path of parsed.files) targets.add(path);
  }
  checkTargetModes(repo, [...targets]);
  const report = previewHandoffBatch(repo, folder, baseSha);
  return {
    ...report,
    modeSafety: "REGULAR_NONEXECUTABLE_100644_ONLY",
    trackedTargetModesChecked: targets.size,
    authVerified: false,
    publishApproved: false,
  };
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
      "Usage: node scripts/preview-handoff-batch-safe.mjs --repo <repo> --handoffs <folder> --base <sha>",
    );
    process.exitCode = 2;
  } else {
    try {
      const report = previewHandoffBatchSafe(args[1], args[3], args[5]);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode =
        report.readiness === "TEMP_MERGE_PREVIEW_PASSED" ? 0 : 3;
    } catch (error) {
      console.error(
        `SAFE_BATCH_PREVIEW_BLOCKED:${error instanceof Error ? error.message : "UNKNOWN"}`,
      );
      process.exitCode = 2;
    }
  }
}
