import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EXPECTED_HEAD,
  EXPECTED_BATCHES,
  parseHandoff,
  buildPlan,
  planDirectory,
} from "../scripts/plan-handoff-consumption.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const target = (n) => `apps/wechat-mini/tests/b${n}.test.mjs`;
const special = {
  50: [
    "apps/wechat-mini/src/core/g2-readiness.ts",
    "apps/wechat-mini/tests/g2-readiness.test.mjs",
  ],
  66: ["apps/wechat-mini/src/core/g2-readiness.ts"],
  72: [
    "apps/wechat-mini/src/core/g2-readiness.ts",
    "apps/wechat-mini/tests/g2-readiness.test.mjs",
    target(72),
  ],
  51: ["apps/wechat-mini/src/core/venue-draft-return.ts"],
  64: ["apps/wechat-mini/src/core/venue-draft-return.ts"],
  73: ["apps/wechat-mini/src/core/venue-draft-return.ts", target(73)],
  58: ["apps/wechat-mini/src/core/identity-mock.ts"],
  69: [
    "apps/wechat-mini/src/core/identity-mock.ts",
    "apps/wechat-mini/tests/offline.test.mjs",
  ],
  70: [
    "apps/wechat-mini/src/core/identity-mock.ts",
    "apps/wechat-mini/tests/offline.test.mjs",
  ],
  74: [
    "apps/wechat-mini/scripts/plan-handoff-consumption.mjs",
    "apps/wechat-mini/tests/plan-handoff-consumption.test.mjs",
  ],
  75: [
    "apps/wechat-mini/src/core/identity-mock.ts",
    "apps/wechat-mini/tests/offline.test.mjs",
    "apps/wechat-mini/tests/identity-boundary-snapshot.test.mjs",
    "apps/wechat-mini/tests/identity-binding-terminal-lock.test.mjs",
    "apps/wechat-mini/tests/identity-exchange-terminal-lock.test.mjs",
  ],
  76: [
    "apps/wechat-mini/scripts/plan-handoff-consumption.mjs",
    "apps/wechat-mini/tests/plan-handoff-consumption.test.mjs",
  ],
};
const fixture = (n, options = {}) => {
  const paths = options.paths ?? special[n] ?? [target(n)];
  const patch = paths
    .map(
      (p) =>
        `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1 +1 @@\n-old\n+new\n`,
    )
    .join("");
  const text = `# 第${n}批 PATCH_PACKAGE\nBASE_SHA=${options.head ?? EXPECTED_HEAD}\nPATCH_SHA256=${options.digest ?? hash(patch)}\nSTATUS=CHAT_WRITE_REQUIRED / NOT_APPLIED\n\n\`\`\`diff\n${patch.trimEnd()}\n\`\`\`\n`;
  return parseHandoff(
    `batch-${n}.md`,
    options.mutate ? options.mutate(text) : text,
  );
};
const queue = () => EXPECTED_BATCHES.map((n) => fixture(n));
const hasProblem = (item, code) => item.problems.includes(code);
const hasBlocker = (items, code) =>
  buildPlan(items).blockers.some((blocker) => blocker.code === code);

test("27 handoffs reduce to 19 candidates, never auto-approve", () => {
  const plan = buildPlan(queue());
  assert.equal(plan.status, "PLAN_REVIEW_REQUIRED");
  assert.equal(plan.activeBatches.length, 19);
  assert.deepEqual(plan.superseded, [
    { batch: 50, by: 72 },
    { batch: 51, by: 73 },
    { batch: 58, by: 75 },
    { batch: 64, by: 73 },
    { batch: 66, by: 72 },
    { batch: 69, by: 75 },
    { batch: 70, by: 75 },
    { batch: 74, by: 76 },
  ]);
  assert.equal(plan.activeBatches.includes(75), true);
  assert.equal(plan.activeBatches.includes(76), true);
  assert.deepEqual(plan.blockers, []);
});
test("tampered patch digest fails closed", () => {
  assert.ok(
    hasProblem(
      fixture(52, { digest: "0".repeat(64) }),
      "PATCH_DIGEST_MISMATCH",
    ),
  );
});
test("wrong HEAD fails closed", () => {
  assert.ok(
    hasProblem(fixture(52, { head: "1".repeat(40) }), "BASE_HEAD_MISMATCH"),
  );
});
test("missing package blocks plan", () => {
  assert.ok(hasBlocker(queue().slice(1), "MISSING_BATCH"));
});
test("duplicate batch blocks plan", () => {
  assert.ok(hasBlocker([...queue(), fixture(50)], "DUPLICATE_BATCH"));
});
test("undeclared overlapping target blocks plan", () => {
  const items = queue().map((x) =>
    x.batch === 52 ? fixture(52, { paths: [target(53)] }) : x,
  );
  assert.ok(hasBlocker(items, "UNDECLARED_TARGET_COLLISION"));
});
test("replacement missing original target blocks plan", () => {
  const items = queue().map((x) =>
    x.batch === 72 ? fixture(72, { paths: [target(72)] }) : x,
  );
  assert.ok(hasBlocker(items, "REPLACEMENT_MISSING_TARGET"));
});
test("path traversal is rejected", () => {
  assert.ok(
    hasProblem(
      fixture(52, { paths: ["apps/wechat-mini/../secrets.txt"] }),
      "UNSAFE_DIFF_TARGET",
    ),
  );
});
test("outside app and limited docs scope is rejected", () => {
  assert.ok(
    hasProblem(
      fixture(52, { paths: ["src/repositories/supabase.ts"] }),
      "UNSAFE_DIFF_TARGET",
    ),
  );
});
test("unexpected docs target is rejected", () => {
  assert.ok(
    hasProblem(
      fixture(52, { paths: ["docs/research/miniprogram/handoff.md"] }),
      "UNEXPECTED_DOC_TARGET",
    ),
  );
});
test("missing diff is rejected", () => {
  assert.ok(
    hasProblem(
      fixture(52, { mutate: (s) => s.replace("```diff", "```text") }),
      "PATCH_BLOCK_COUNT_NOT_ONE",
    ),
  );
});
test("multiple diff blocks are rejected", () => {
  assert.ok(
    hasProblem(
      fixture(52, { mutate: (s) => `${s}\n\`\`\`diff\nextra\n\`\`\`\n` }),
      "PATCH_BLOCK_COUNT_NOT_ONE",
    ),
  );
});
test("non-pending status is rejected", () => {
  assert.ok(
    hasProblem(
      fixture(52, {
        mutate: (s) =>
          s.replace(
            "CHAT_WRITE_REQUIRED / NOT_APPLIED",
            "IMPLEMENTED_AND_G1_PASSED",
          ),
      }),
      "NOT_PENDING_HANDOFF",
    ),
  );
});
test("malformed title is rejected", () => {
  assert.ok(
    hasProblem(
      fixture(52, { mutate: (s) => s.replace("第52批", "batch 52") }),
      "INVALID_BATCH_TITLE",
    ),
  );
});
test("binary patch is rejected", () => {
  assert.ok(
    hasProblem(
      fixture(52, {
        mutate: (s) => s.replace("-old", "GIT binary patch\n-old"),
      }),
      "UNSUPPORTED_PATCH_OPERATION",
    ),
  );
});

test("B75 must contain every B58/B69/B70 target", () => {
  const items = queue().map((x) =>
    x.batch === 75 ? fixture(75, { paths: [target(75)] }) : x,
  );
  assert.ok(hasBlocker(items, "REPLACEMENT_MISSING_TARGET"));
});
test("B76 must contain both B74 plan files", () => {
  const items = queue().map((x) =>
    x.batch === 76 ? fixture(76, { paths: [target(76)] }) : x,
  );
  assert.ok(hasBlocker(items, "REPLACEMENT_MISSING_TARGET"));
});
test("spoofed +++ path cannot escape declared diff target", () => {
  const x = fixture(52, {
    mutate: (s) =>
      s.replace(`+++ b/${target(52)}`, "+++ b/apps/wechat-mini/hidden.ts"),
  });
  assert.ok(hasProblem(x, "PATCH_TARGET_HEADER_MISMATCH"));
});
test("missing unified hunk is rejected", () => {
  const x = fixture(52, {
    mutate: (s) => s.replace("@@ -1 +1 @@", "@@invalid"),
  });
  assert.ok(hasProblem(x, "MISSING_UNIFIED_HUNK"));
});
test("renames are unsupported", () => {
  const x = fixture(52, {
    mutate: (s) => s.replace("--- a/", "rename from secret\n--- a/"),
  });
  assert.ok(hasProblem(x, "UNSUPPORTED_PATCH_OPERATION"));
});
test("changed live HEAD blocks before reading any handoff", async () => {
  const plan = await planDirectory("/nonexistent", "1".repeat(40));
  assert.equal(plan.status, "PLAN_BLOCKED");
  assert.equal(plan.blockers[0].code, "LIVE_HEAD_CHANGED");
});
test("symlinked handoff file is rejected before reading", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mp-plan-test-"));
  const real = join(dir, "real.txt");
  await writeFile(real, "secret test fixture");
  await symlink(real, join(dir, "unsafe.md"));
  try {
    const plan = await planDirectory(dir);
    assert.equal(plan.status, "PLAN_BLOCKED");
    assert.equal(plan.blockers[0].code, "UNSAFE_HANDOFF_FILE_TYPE");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
