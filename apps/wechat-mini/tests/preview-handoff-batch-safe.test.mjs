import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkPatchModes,
  previewHandoffBatchSafe,
} from "../scripts/preview-handoff-batch-safe.mjs";

const target = "apps/wechat-mini/src/core/guard.ts";
const validPatch = `diff --git a/${target} b/${target}\nnew file mode 100644\n--- /dev/null\n+++ b/${target}\n@@ -0,0 +1 @@\n+export const guard = true;\n`;
const modePatch = `diff --git a/${target} b/${target}\nold mode 100644\nnew mode 100755\nindex 1111111..2222222\n--- a/${target}\n+++ b/${target}\n@@ -1 +1 @@\n-export const guard = false;\n+export const guard = true;\n`;
function git(repo, ...args) {
  const r = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "qdmp-safe-preview-"));
  const repo = join(root, "repo");
  const handoffs = join(root, "handoffs");
  mkdirSync(repo);
  mkdirSync(handoffs);
  try {
    git(repo, "init", "-q");
    git(repo, "checkout", "-q", "-b", "feature/v8-confirmed-20261011");
    writeFileSync(join(repo, "README.md"), "offline fixture\n");
    git(repo, "add", "README.md");
    git(
      repo,
      "-c",
      "user.name=Offline",
      "-c",
      "user.email=offline@example.invalid",
      "commit",
      "-qm",
      "base",
    );
    const base = git(repo, "rev-parse", "HEAD");
    const add = (patch) => {
      const sha = createHash("sha256").update(patch).digest("hex");
      writeFileSync(
        join(handoffs, "01.md"),
        `STATUS=CHAT_WRITE_REQUIRED\nPATCH_PACKAGE_ID=QD-MP-SAFE-PREVIEW-TEST\nBASE_EXACT_HEAD=${base}\nPATCH_SHA256=${sha}\n\n\`\`\`diff\n${patch}\`\`\`\n`,
      );
    };
    run({ repo, handoffs, base, add });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("regular new source file is accepted by mode policy", () => {
  assert.equal(checkPatchModes(validPatch).safe, true);
});
test("realistic chmod +x content patch is rejected (previous parser accepted it)", () => {
  assert.throws(
    () => checkPatchModes(modePatch),
    /PATCH_MODE_CHANGE_FORBIDDEN/,
  );
});
test("symlink, executable and gitlink new file modes are rejected", () => {
  for (const mode of ["120000", "100755", "160000"])
    assert.throws(
      () => checkPatchModes(validPatch.replace("100644", mode)),
      /UNSAFE_NEW_FILE_MODE/,
    );
});
test("non-regular index mode is rejected even without explicit mode change", () => {
  assert.throws(
    () =>
      checkPatchModes(
        validPatch.replace(
          "new file mode 100644",
          "index 0000000..1111111 120000",
        ),
      ),
    /UNSAFE_INDEX_MODE/,
  );
});
test("non-git legacy patch is mode-safe but must retain review warning", () => {
  assert.equal(
    checkPatchModes(`--- /dev/null\n+++ b/${target}\n@@ -0,0 +1 @@\n+test\n`)
      .legacy,
    true,
  );
});
test("safe wrapper rehearses valid patch without modifying original repository", () => {
  fixture(({ repo, handoffs, base, add }) => {
    add(validPatch);
    const report = previewHandoffBatchSafe(repo, handoffs, base);
    assert.equal(report.modeSafety, "REGULAR_NONEXECUTABLE_100644_ONLY");
    assert.equal(report.readiness, "TEMP_MERGE_PREVIEW_PASSED");
    assert.equal(report.authVerified, false);
    assert.equal(existsSync(join(repo, target)), false);
    assert.equal(git(repo, "status", "--porcelain"), "");
  });
});
test("legacy bare unified diff rehearses but remains REVIEW_REQUIRED", () => {
  fixture(({ repo, handoffs, base, add }) => {
    const legacy = `--- /dev/null\n+++ b/${target}\n@@ -0,0 +1 @@\n+export const guard = true;\n`;
    add(legacy);
    const report = previewHandoffBatchSafe(repo, handoffs, base);
    assert.equal(report.readiness, "REVIEW_REQUIRED");
    assert.ok(
      report.warnings.some((w) => w.includes("LEGACY_NO_GIT_FILE_HEADERS")),
    );
  });
});
test("safe wrapper blocks mode change before running merge rehearsal", () => {
  fixture(({ repo, handoffs, base, add }) => {
    add(modePatch);
    assert.throws(
      () => previewHandoffBatchSafe(repo, handoffs, base),
      /PATCH_MODE_CHANGE_FORBIDDEN/,
    );
  });
});
test("safe wrapper blocks tracked symlink at target path", () => {
  fixture(({ repo, handoffs, base, add }) => {
    mkdirSync(join(repo, "apps/wechat-mini/src/core"), { recursive: true });
    symlinkSync("../../../../README.md", join(repo, target));
    git(repo, "add", target);
    git(
      repo,
      "-c",
      "user.name=Offline",
      "-c",
      "user.email=offline@example.invalid",
      "commit",
      "-qm",
      "symlink",
    );
    add(validPatch);
    assert.throws(
      () => previewHandoffBatchSafe(repo, handoffs, base),
      /UNSAFE_TRACKED_TARGET_MODE/,
    );
  });
});
test("safe wrapper blocks executable tracked target", () => {
  fixture(({ repo, handoffs, base, add }) => {
    mkdirSync(join(repo, "apps/wechat-mini/src/core"), { recursive: true });
    writeFileSync(join(repo, target), "export const old = true;\n");
    chmodSync(join(repo, target), 0o755);
    git(repo, "add", target);
    git(
      repo,
      "-c",
      "user.name=Offline",
      "-c",
      "user.email=offline@example.invalid",
      "commit",
      "-qm",
      "executable",
    );
    add(validPatch);
    assert.throws(
      () => previewHandoffBatchSafe(repo, handoffs, base),
      /UNSAFE_TRACKED_TARGET_MODE/,
    );
  });
});
test("safe wrapper blocks untracked target collision", () => {
  fixture(({ repo, handoffs, base, add }) => {
    mkdirSync(join(repo, "apps/wechat-mini/src/core"), { recursive: true });
    writeFileSync(join(repo, target), "untracked\n");
    add(validPatch);
    assert.throws(
      () => previewHandoffBatchSafe(repo, handoffs, base),
      /UNTRACKED_TARGET_COLLISION/,
    );
  });
});
