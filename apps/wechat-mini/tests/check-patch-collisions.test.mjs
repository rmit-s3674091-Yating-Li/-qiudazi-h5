import test from "node:test";
import assert from "node:assert/strict";
import { changedPaths, analyze } from "../scripts/check-patch-collisions.mjs";
const patch = (p) =>
  `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -0,0 +1 @@\n+x\n`;
test("disjoint packages combine", () =>
  assert.equal(
    analyze([
      ["A", patch("apps/wechat-mini/a.ts")],
      ["B", patch("apps/wechat-mini/b.ts")],
    ]).safeToCombine,
    true,
  ));
test("overlap blocks combination", () =>
  assert.deepEqual(
    analyze([
      ["A", patch("apps/wechat-mini/a.ts")],
      ["B", patch("apps/wechat-mini/a.ts")],
    ]).conflicts[0].packages,
    ["A", "B"],
  ));
test("reject traversal", () =>
  assert.throws(
    () => changedPaths(patch("apps/wechat-mini/../secret")),
    /UNSAFE_PATH/,
  ));
test("reject out of scope", () =>
  assert.throws(
    () => changedPaths(patch("src/main.tsx")),
    /OUT_OF_SCOPE_PATH/,
  ));
test("reject duplicate headers", () =>
  assert.throws(
    () =>
      changedPaths(
        patch("apps/wechat-mini/a.ts") + patch("apps/wechat-mini/a.ts"),
      ),
    /DUPLICATE/,
  ));
test("reject empty", () =>
  assert.throws(() => changedPaths(""), /EMPTY_PATCH/));
test("reject rename", () =>
  assert.throws(
    () => changedPaths("diff --git a/apps/wechat-mini/a b/apps/wechat-mini/b"),
    /UNSUPPORTED/,
  ));

test("reject spoofed --- header", () =>
  assert.throws(
    () =>
      changedPaths(
        patch("apps/wechat-mini/a.ts").replace(
          "--- a/apps/wechat-mini/a.ts",
          "--- a/src/private.ts",
        ),
      ),
    /FILE_HEADER_MISMATCH/,
  ));
test("reject spoofed +++ header", () =>
  assert.throws(
    () =>
      changedPaths(
        patch("apps/wechat-mini/a.ts").replace(
          "+++ b/apps/wechat-mini/a.ts",
          "+++ b/src/private.ts",
        ),
      ),
    /FILE_HEADER_MISMATCH/,
  ));
test("reject incomplete file header", () =>
  assert.throws(
    () =>
      changedPaths(
        "diff --git a/apps/wechat-mini/a.ts b/apps/wechat-mini/a.ts",
      ),
    /INCOMPLETE_FILE_HEADER/,
  ));
test("reject binary payload", () =>
  assert.throws(
    () => changedPaths(patch("apps/wechat-mini/a.ts") + "GIT binary patch\n"),
    /UNSUPPORTED_PATCH_OPERATION/,
  ));
test("reject orphan header", () =>
  assert.throws(
    () => changedPaths("--- a/apps/wechat-mini/a.ts\n"),
    /ORPHAN_FILE_HEADER/,
  ));

test("accept hunk text that resembles a file header", () => {
  const p = "apps/wechat-mini/a.ts";
  assert.deepEqual(
    [
      ...changedPaths(
        `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1 +1 @@\n--- example\n+++ example\n`,
      ),
    ],
    [p],
  );
});
test("reject truncated hunk body", () =>
  assert.throws(
    () => changedPaths(patch("apps/wechat-mini/a.ts").replace("+x\n", "")),
    /INCOMPLETE_HUNK/,
  ));
test("reject hunk count overflow", () =>
  assert.throws(
    () => changedPaths(patch("apps/wechat-mini/a.ts").replace("+x\n", " x\n")),
    /HUNK_COUNT_OVERFLOW/,
  ));
