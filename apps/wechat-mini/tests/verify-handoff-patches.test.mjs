import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parsePatchHandoff,
  preflightHandoffBatch,
} from "../scripts/verify-handoff-patches.mjs";

const file = "apps/wechat-mini/src/core/new-gate.ts";
const patch = `diff --git a/${file} b/${file}\nnew file mode 100644\nindex 0000000..1234567\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+export const safe = true;\n`;
const hash = (s) => createHash("sha256").update(s).digest("hex");
const base = "a".repeat(40);
function handoff(
  diff = patch,
  {
    head = base,
    digest = hash(diff),
    id = "QD-MP-TEST-123",
    status = "CHAT_WRITE_REQUIRED",
  } = {},
) {
  return `STATUS=${status}\nPATCH_PACKAGE_ID=${id}\n${head === null ? "" : `BASE_EXACT_HEAD=${head}\n`}${digest === null ? "" : `PATCH_SHA256=${digest}\n`}\n\`\`\`diff\n${diff}\`\`\`\n`;
}
function git(repo, ...args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture(callback) {
  const root = mkdtempSync(join(tmpdir(), "qd-mini-patch-preflight-"));
  const repo = join(root, "repo");
  const handoffs = join(root, "handoffs");
  mkdirSync(repo);
  mkdirSync(handoffs);
  try {
    git(repo, "init", "-q");
    git(repo, "checkout", "-q", "-b", "feature/v8-confirmed-20261011");
    git(
      repo,
      "-c",
      "user.email=offline@example.invalid",
      "-c",
      "user.name=Offline",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "fixture",
    );
    const head = git(repo, "rev-parse", "HEAD");
    callback({
      root,
      repo,
      handoffs,
      head,
      write: (name, contents) => writeFileSync(join(handoffs, name), contents),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("valid exact-head package parses with SHA-256 and exact file path", () => {
  const parsed = parsePatchHandoff(handoff());
  assert.equal(parsed.digest, hash(patch));
  assert.deepEqual(parsed.files, [file]);
  assert.deepEqual(parsed.warnings, []);
});
test("legacy missing digest/head remains REVIEW_REQUIRED, never automatic integrity PASS", () => {
  const parsed = parsePatchHandoff(
    handoff(patch, { head: null, digest: null }),
  );
  assert.deepEqual(parsed.warnings, [
    "LEGACY_MISSING_EXACT_HEAD",
    "LEGACY_MISSING_DIGEST",
  ]);
});
test("legacy bare unified diff is recognized but requires manual review", () => {
  const bare = patch
    .replace(/^diff --git.*\n/, "")
    .replace(/^new file mode.*\n/, "")
    .replace(/^index.*\n/, "");
  const parsed = parsePatchHandoff(handoff(bare, { digest: null }));
  assert.deepEqual(parsed.files, [file]);
  assert.ok(parsed.warnings.includes("LEGACY_NO_GIT_FILE_HEADERS"));
});
test("legacy absolute source in new-file git header is flagged, not silently approved", () => {
  const altered = patch.replace(
    `a/${file} b/${file}`,
    `a/mnt/data/scratch/${file} b/${file}`,
  );
  const parsed = parsePatchHandoff(handoff(altered));
  assert.ok(parsed.warnings.includes("NONCANONICAL_GIT_FROM_PATH"));
});
test("tampered diff is rejected even when valid-looking", () => {
  assert.throws(
    () =>
      parsePatchHandoff(
        handoff(patch.replace("true", "false"), { digest: hash(patch) }),
      ),
    /PATCH_DIGEST_MISMATCH/,
  );
});
test("no diff or two diff blocks fail closed", () => {
  assert.throws(
    () =>
      parsePatchHandoff(
        "STATUS=CHAT_WRITE_REQUIRED\nPATCH_PACKAGE_ID=QD-MP-TEST-123",
      ),
    /EXPECTED_ONE_DIFF_BLOCK/,
  );
  assert.throws(
    () => parsePatchHandoff(handoff() + `\n\`\`\`diff\n${patch}\`\`\`\n`),
    /EXPECTED_ONE_DIFF_BLOCK/,
  );
});
test("reject path traversal, H5 target and duplicate target headers", () => {
  for (const unsafe of [
    "apps/wechat-mini/../src/unsafe.ts",
    "src/pages/H5.ts",
    "apps/wechat-mini//unsafe.ts",
    "apps/wechat-mini/./unsafe.ts",
  ]) {
    const altered = patch.replaceAll(file, unsafe);
    assert.throws(
      () => parsePatchHandoff(handoff(altered)),
      /UNSAFE_PATCH_PATH/,
    );
  }
  assert.throws(
    () => parsePatchHandoff(handoff(patch + patch)),
    /DUPLICATE_PATCH_PATH/,
  );
});
test("forged +++ header and executable mode are rejected", () => {
  const changedHeader = patch.replace(`+++ b/${file}`, "+++ b/src/pages/H5.ts");
  assert.throws(
    () => parsePatchHandoff(handoff(changedHeader)),
    /UNSAFE_PATCH_(?:CONTENT_)?PATH/,
  );
  const executable = patch.replace(
    "new file mode 100644",
    "new file mode 100755",
  );
  assert.throws(
    () => parsePatchHandoff(handoff(executable)),
    /UNSAFE_FILE_MODE/,
  );
});
test("reject binary, delete and rename operations", () => {
  for (const operation of [
    "GIT binary patch",
    "delete file mode 100644",
    "rename from x",
  ]) {
    assert.throws(
      () => parsePatchHandoff(handoff(`${patch}${operation}\n`)),
      /UNSUPPORTED_PATCH_OPERATION/,
    );
  }
});
test("reject duplicate metadata, nonpending status and oversized handoff", () => {
  assert.throws(
    () => parsePatchHandoff(handoff() + "STATUS=CHAT_WRITE_REQUIRED\n"),
    /DUPLICATE_STATUS/,
  );
  assert.throws(
    () => parsePatchHandoff(handoff(patch, { status: "CONSUMED" })),
    /NOT_PENDING/,
  );
  assert.throws(
    () => parsePatchHandoff("x".repeat(512_001)),
    /INVALID_HANDOFF_SIZE/,
  );
});
test("read-only preflight checks patch against exact clean branch without applying it", () => {
  fixture(({ repo, handoffs, head, write }) => {
    write("one.md", handoff(patch, { head }));
    const before = git(repo, "status", "--porcelain");
    const result = preflightHandoffBatch(repo, handoffs);
    assert.equal(result.readiness, "PRECHECK_READY");
    assert.equal(result.batchApplied, false);
    assert.equal(result.packages[0].independentlyApplies, true);
    assert.equal(git(repo, "status", "--porcelain"), before);
    assert.equal(git(repo, "ls-files").includes(file), false);
  });
});
test("legacy metadata needs human review even when git apply --check passes", () => {
  fixture(({ repo, handoffs, write }) => {
    write("one.md", handoff(patch, { head: null, digest: null }));
    assert.equal(
      preflightHandoffBatch(repo, handoffs).readiness,
      "REVIEW_REQUIRED",
    );
  });
});
test("stale exact head, dirty tracked tree and wrong branch block preflight", () => {
  fixture(({ repo, handoffs, write }) => {
    write("one.md", handoff());
    assert.throws(
      () => preflightHandoffBatch(repo, handoffs),
      /STALE_PACKAGE_HEAD/,
    );
    write("one.md", handoff(patch, { head: null }));
    writeFileSync(join(repo, "tracked.txt"), "base");
    git(repo, "add", "tracked.txt");
    git(
      repo,
      "-c",
      "user.email=offline@example.invalid",
      "-c",
      "user.name=Offline",
      "commit",
      "-q",
      "-m",
      "add tracked",
    );
    writeFileSync(join(repo, "tracked.txt"), "dirty");
    assert.throws(
      () => preflightHandoffBatch(repo, handoffs),
      /TRACKED_WORKTREE_DIRTY/,
    );
    git(repo, "checkout", "-q", "-b", "other-branch");
    assert.throws(
      () => preflightHandoffBatch(repo, handoffs),
      /WRONG_DEVELOPMENT_BRANCH/,
    );
  });
});
test("overlapping patch target paths fail even when both independently apply", () => {
  fixture(({ repo, handoffs, head, write }) => {
    write("one.md", handoff(patch, { head, id: "QD-MP-TEST-111" }));
    write("two.md", handoff(patch, { head, id: "QD-MP-TEST-222" }));
    assert.throws(
      () => preflightHandoffBatch(repo, handoffs),
      /OVERLAPPING_TARGET_FILES/,
    );
  });
});
test("malformed git diff fails independently without modifying the worktree", () => {
  fixture(({ repo, handoffs, head, write }) => {
    const broken = patch.replace(
      "+export const safe = true;",
      "not-a-diff-line",
    );
    write("one.md", handoff(broken, { head }));
    assert.throws(
      () => preflightHandoffBatch(repo, handoffs),
      /GIT_APPLY_CHECK_FAILED/,
    );
    assert.equal(git(repo, "status", "--porcelain"), "");
  });
});
test(
  "duplicate package ID and symlinked handoff are rejected",
  { skip: process.platform === "win32" },
  () => {
    fixture(({ repo, handoffs, head, write }) => {
      write("one.md", handoff(patch, { head }));
      const secondFile = "apps/wechat-mini/src/core/another-gate.ts";
      const otherPatch = patch.replaceAll(file, secondFile);
      write("two.md", handoff(otherPatch, { head }));
      assert.throws(
        () => preflightHandoffBatch(repo, handoffs),
        /DUPLICATE_PACKAGE_ID/,
      );
    });
  },
);
