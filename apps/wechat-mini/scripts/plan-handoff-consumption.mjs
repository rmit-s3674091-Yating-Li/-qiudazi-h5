/** Read-only, offline preflight for the B50–B76 handoff queue. Not an apply tool. */
import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EXPECTED_HEAD = "93384522c831b86dc8c6e2fef45454325c4a4a01";
export const EXPECTED_BATCHES = Object.freeze(
  Array.from({ length: 27 }, (_, i) => i + 50),
);
export const REPLACEMENTS = Object.freeze({
  72: [50, 66],
  73: [51, 64],
  75: [58, 69, 70],
  76: [74],
});

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const safePath = (path) =>
  typeof path === "string" &&
  !path.includes("\\") &&
  !path
    .split("/")
    .some((part) => part === ".." || part === "." || part === "") &&
  (path.startsWith("apps/wechat-mini/") ||
    path.startsWith("docs/research/miniprogram/"));

/** Never interpret a package's prose as authority to mark it consumed. */
export function parseHandoff(name, content, expectedHead = EXPECTED_HEAD) {
  const problems = [];
  const title = content.split(/\r?\n/, 1)[0] ?? "";
  const number = /第(\d+)批/.exec(title);
  const batch = number ? Number(number[1]) : null;
  if (!Number.isSafeInteger(batch) || batch < 50 || batch > 76)
    problems.push("INVALID_BATCH_TITLE");
  const field = (key) => {
    const match = new RegExp(
      `^\\s*(?:-\\s*)?(?:\\x60)?${key}(?:\\x60)?\\s*[:=]\\s*(?:\\x60)?([^\\x60\\r\\n ]+)`,
      "m",
    ).exec(content);
    return match?.[1] ?? null;
  };
  const base =
    field("BASE_EXACT_HEAD") ??
    field("BASE_SHA") ??
    field("BASE_HEAD") ??
    field("EXACT_HEAD");
  if (base !== expectedHead) problems.push("BASE_HEAD_MISMATCH");
  const declared = field("PATCH_SHA256");
  if (!declared || !/^[a-f0-9]{64}$/.test(declared))
    problems.push("MISSING_PATCH_DIGEST");
  const blocks = [...content.matchAll(/^```diff\r?\n([\s\S]*?)\r?\n```\s*$/gm)];
  if (blocks.length !== 1) problems.push("PATCH_BLOCK_COUNT_NOT_ONE");
  const patch = blocks.length === 1 ? `${blocks[0][1]}\n` : "";
  if (patch && sha256(patch) !== declared)
    problems.push("PATCH_DIGEST_MISMATCH");
  const paths = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)];
  if (!paths.length) problems.push("NO_DIFF_TARGETS");
  const targets = [];
  for (const [, a, b] of paths) {
    if (a !== b || !safePath(a)) problems.push("UNSAFE_DIFF_TARGET");
    if (targets.includes(a)) problems.push("DUPLICATE_DIFF_TARGET");
    targets.push(a);
    if (a.startsWith("docs/") && batch !== 72 && batch !== 50)
      problems.push("UNEXPECTED_DOC_TARGET");
  }
  // A diff --git line alone is not an authoritative target: check each actual
  // ---/+++ header, and refuse rename, deletion, symlink and binary operations.
  const chunks = patch.split(/(?=^diff --git a\/)/m).filter(Boolean);
  for (const chunk of chunks) {
    const head = /^diff --git a\/(\S+) b\/(\S+)$/m.exec(chunk);
    if (!head) {
      problems.push("INVALID_DIFF_SECTION");
      continue;
    }
    const header = chunk.split(/^@@ /m, 1)[0];
    const oldHeader = /^--- (\S+)$/m.exec(header)?.[1];
    const newHeader = /^\+\+\+ (\S+)$/m.exec(header)?.[1];
    if (
      !oldHeader ||
      !newHeader ||
      (oldHeader !== `a/${head[1]}` && oldHeader !== "/dev/null") ||
      newHeader !== `b/${head[2]}` ||
      (oldHeader === "/dev/null" && !/^new file mode 100644$/m.test(chunk))
    )
      problems.push("PATCH_TARGET_HEADER_MISMATCH");
    if (!/^@@ /m.test(chunk)) problems.push("MISSING_UNIFIED_HUNK");
  }
  if (
    /^(?:old mode|new mode|deleted file mode|new file mode (?!100644$)|rename (?:from|to)|copy (?:from|to)|GIT binary patch|Binary files |Submodule )/m.test(
      patch,
    ) ||
    /^index [a-f0-9]+\.\.[a-f0-9]+ 160000$/m.test(patch)
  )
    problems.push("UNSUPPORTED_PATCH_OPERATION");
  const status = field("STATUS") ?? field("PATCH_STATUS") ?? "";
  if (!/CHAT_WRITE_REQUIRED|NOT_APPLIED/.test(status))
    problems.push("NOT_PENDING_HANDOFF");
  return {
    batch,
    name,
    targets,
    digest: declared,
    base,
    problems: [...new Set(problems)],
  };
}

const overlaps = (a, b) => a.targets.filter((path) => b.targets.includes(path));

export function buildPlan(items) {
  const blockers = [];
  const byBatch = new Map();
  for (const item of items) {
    if (item.batch === null) {
      blockers.push({ code: "UNIDENTIFIED_HANDOFF", file: item.name });
      continue;
    }
    if (byBatch.has(item.batch))
      blockers.push({ code: "DUPLICATE_BATCH", batch: item.batch });
    byBatch.set(item.batch, item);
    for (const code of item.problems)
      blockers.push({ code, batch: item.batch });
  }
  for (const batch of EXPECTED_BATCHES)
    if (!byBatch.has(batch)) blockers.push({ code: "MISSING_BATCH", batch });
  for (const batch of byBatch.keys())
    if (!EXPECTED_BATCHES.includes(batch))
      blockers.push({ code: "UNEXPECTED_BATCH", batch });

  const superseded = new Map();
  for (const [replacement, sources] of Object.entries(REPLACEMENTS)) {
    const target = byBatch.get(Number(replacement));
    if (!target) continue;
    for (const source of sources) {
      const prior = byBatch.get(source);
      if (!prior) continue;
      if (prior.targets.some((path) => !target.targets.includes(path)))
        blockers.push({
          code: "REPLACEMENT_MISSING_TARGET",
          replacement: Number(replacement),
          source,
        });
      superseded.set(source, Number(replacement));
    }
  }
  const active = [...byBatch.values()]
    .filter((item) => !superseded.has(item.batch))
    .sort((a, b) => a.batch - b.batch);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const paths = overlaps(active[i], active[j]);
      if (!paths.length) continue;
      const pair = [active[i].batch, active[j].batch];
      blockers.push({
        code: "UNDECLARED_TARGET_COLLISION",
        batches: pair,
        paths,
      });
    }
  }
  const reviewRequired = [
    "B72 replaces B50/B66 only after manual semantic review and actual integration",
    "B73 replaces B51/B64 only after manual semantic review and actual integration",
    "B75 replaces B58/B69/B70 only after byte-equivalence review and tests",
    "B76 replaces B74; do not apply both overlapping plan scripts",
    "No proof of G1, H5 regression, real Auth, release or consumption",
  ];
  return {
    status: blockers.length ? "PLAN_BLOCKED" : "PLAN_REVIEW_REQUIRED",
    expectedHead: EXPECTED_HEAD,
    inventoryCount: items.length,
    activeBatches: active.map((x) => x.batch),
    superseded: [...superseded]
      .sort((a, b) => a[0] - b[0])
      .map(([batch, by]) => ({ batch, by })),
    blockers,
    reviewRequired,
  };
}

export async function planDirectory(directory, expectedHead = EXPECTED_HEAD) {
  if (expectedHead !== EXPECTED_HEAD) {
    return {
      status: "PLAN_BLOCKED",
      expectedHead: EXPECTED_HEAD,
      suppliedHead: expectedHead,
      blockers: [{ code: "LIVE_HEAD_CHANGED" }],
    };
  }
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".md"))
    .sort();
  const items = [];
  for (const name of names) {
    const path = resolve(directory, name);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return {
        status: "PLAN_BLOCKED",
        expectedHead: EXPECTED_HEAD,
        blockers: [{ code: "UNSAFE_HANDOFF_FILE_TYPE", name }],
      };
    }
    const content = await readFile(path, "utf8");
    items.push(parseHandoff(name, content, expectedHead));
  }
  return buildPlan(items);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [, , directory, head] = process.argv;
  if (!directory || !head || !/^[a-f0-9]{40}$/.test(head)) {
    process.stderr.write(
      "Usage: node plan-handoff-consumption.mjs <handoff-dir> <live-HEAD>\n",
    );
    process.exitCode = 2;
  } else {
    try {
      const result = await planDirectory(directory, head);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.status === "PLAN_BLOCKED") process.exitCode = 2;
    } catch (error) {
      process.stderr.write(
        `READ_FAILED: ${error instanceof Error ? error.message : "unknown"}\n`,
      );
      process.exitCode = 2;
    }
  }
}
