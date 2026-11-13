import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewHandoffBatch } from "../scripts/preview-handoff-batch.mjs";

const BRANCH = "feature/v8-confirmed-20261011";
const pathA = "apps/wechat-mini/src/core/a.ts";
const pathB = "apps/wechat-mini/src/core/b.ts";

function git(repo, ...args) {
  const result = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function patch(path, value = "true") {
  return `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+export const enabled = ${value};\n`;
}

function handoff(diff, head, id = "QD-MP-TEST-ALPHA", extra = "") {
  const digest = createHash("sha256").update(diff).digest("hex");
  return `STATUS=CHAT_WRITE_REQUIRED\nPATCH_PACKAGE_ID=${id}\nBASE_EXACT_HEAD=${head}\nPATCH_SHA256=${digest}\n${extra}\n\`\`\`diff\n${diff}\`\`\`\n`;
}

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "qdmp-preview-fixture-"));
  const repo = join(root, "repo");
  const handoffs = join(root, "handoffs");
  mkdirSync(repo);
  mkdirSync(handoffs);
  try {
    git(repo, "init", "-q");
    git(repo, "checkout", "-q", "-b", BRANCH);
    mkdirSync(join(repo, "docs"));
    writeFileSync(join(repo, "docs", "state.md"), "initial\n");
    git(repo, "add", "docs/state.md");
    git(
      repo,
      "-c",
      "user.email=offline@example.invalid",
      "-c",
      "user.name=Offline",
      "commit",
      "-qm",
      "baseline",
    );
    const base = git(repo, "rev-parse", "HEAD");
    const add = (name, diff, id = "QD-MP-TEST-ALPHA", extra = "") =>
      writeFileSync(join(handoffs, name), handoff(diff, base, id, extra));
    const commit = (message) =>
      git(
        repo,
        "-c",
        "user.email=offline@example.invalid",
        "-c",
        "user.name=Offline",
        "commit",
        "-qm",
        message,
      );
    run({ repo, handoffs, base, add, commit });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("two nonoverlapping patches apply sequentially in temporary clone only", () => {
  fixture(({ repo, handoffs, base, add }) => {
    add("01.md", patch(pathA));
    add("02.md", patch(pathB), "QD-MP-TEST-BETA");
    const before = git(repo, "status", "--porcelain");
    const report = previewHandoffBatch(repo, handoffs, base);
    assert.equal(report.readiness, "TEMP_MERGE_PREVIEW_PASSED");
    assert.deepEqual(report.changedPaths, [pathA, pathB]);
    assert.equal(report.packages.length, 2);
    assert.equal(report.temporaryCloneDeleted, true);
    assert.equal(report.originalRepoWritten, false);
    assert.equal(report.testsRun, false);
    assert.equal(report.sessionBridge, "SESSION_BRIDGE_UNPROVEN");
    assert.equal(existsSync(join(repo, pathA)), false);
    assert.equal(git(repo, "status", "--porcelain"), before);
  });
});

test("unrelated HEAD advance can rehearse but remains REVIEW_REQUIRED", () => {
  fixture(({ repo, handoffs, base, add, commit }) => {
    add("01.md", patch(pathA));
    writeFileSync(join(repo, "docs", "state.md"), "changed\n");
    git(repo, "add", "docs/state.md");
    commit("unrelated H5 change");
    const report = previewHandoffBatch(repo, handoffs, base);
    assert.equal(report.readiness, "REVIEW_REQUIRED");
    assert.ok(
      report.warnings.includes(
        "HEAD_ADVANCED_WITHOUT_TARGET_OVERLAP_REVIEW_REQUIRED",
      ),
    );
    assert.notEqual(report.observedHead, base);
  });
});

test("later package based on advanced HEAD is allowed only within ancestry and reviewed", () => {
  fixture(({ repo, handoffs, base, add, commit }) => {
    add("01.md", patch(pathA));
    writeFileSync(join(repo, "docs/state.md"), "later\n");
    git(repo, "add", "docs/state.md");
    commit("advance unrelated state");
    const advanced = git(repo, "rev-parse", "HEAD");
    writeFileSync(
      join(handoffs, "02.md"),
      handoff(patch(pathB), advanced, "QD-MP-TEST-BETA"),
    );
    const report = previewHandoffBatch(repo, handoffs, base);
    assert.equal(report.readiness, "REVIEW_REQUIRED");
    assert.ok(
      report.warnings.some((x) =>
        x.includes("PACKAGE_BASE_ADVANCED_WITHIN_ANCESTRY"),
      ),
    );
    assert.deepEqual(report.changedPaths, [pathA, pathB]);
  });
});

test("HEAD changed a target path: block before any apply", () => {
  fixture(({ repo, handoffs, base, add, commit }) => {
    add("01.md", patch(pathA));
    mkdirSync(join(repo, "apps/wechat-mini/src/core"), { recursive: true });
    writeFileSync(join(repo, pathA), "export const remote = true;\n");
    git(repo, "add", pathA);
    commit("target overlap");
    assert.throws(
      () => previewHandoffBatch(repo, handoffs, base),
      /HEAD_TARGET_OVERLAP/,
    );
  });
});

test("overlapping handoff targets fail closed", () => {
  fixture(({ repo, handoffs, base, add }) => {
    add("01.md", patch(pathA));
    add("02.md", patch(pathA, "false"), "QD-MP-TEST-BETA");
    assert.throws(
      () => previewHandoffBatch(repo, handoffs, base),
      /OVERLAPPING_PATCH_TARGET/,
    );
  });
});

test("bad digest fails before temp checkout", () => {
  fixture(({ repo, handoffs, base, add }) => {
    add("01.md", patch(pathA));
    const file = join(handoffs, "01.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace("enabled = true", "enabled = false"),
    );
    assert.throws(
      () => previewHandoffBatch(repo, handoffs, base),
      /PATCH_DIGEST_MISMATCH/,
    );
  });
});

test("legacy digest warning cannot be counted as automatic PASS", () => {
  fixture(({ repo, handoffs, base, add }) => {
    add("01.md", patch(pathA));
    const file = join(handoffs, "01.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(/^PATCH_SHA256=.*\n/m, ""),
    );
    const report = previewHandoffBatch(repo, handoffs, base);
    assert.equal(report.readiness, "REVIEW_REQUIRED");
    assert.ok(report.warnings.some((x) => x.includes("LEGACY_MISSING_DIGEST")));
  });
});

test("mismatched package base fails even when current repo has base ancestor", () => {
  fixture(({ repo, handoffs, base, add }) => {
    add("01.md", patch(pathA));
    const file = join(handoffs, "01.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(base, "a".repeat(40)),
    );
    assert.throws(
      () => previewHandoffBatch(repo, handoffs, base),
      /INCONSISTENT_PACKAGE_BASE/,
    );
  });
});

test("non-ancestor base and invalid base are refused", () => {
  fixture(({ repo, handoffs, base, add }) => {
    add("01.md", patch(pathA));
    assert.throws(
      () => previewHandoffBatch(repo, handoffs, "not-a-sha"),
      /INVALID_BASE_SHA/,
    );
    assert.throws(
      () => previewHandoffBatch(repo, handoffs, "b".repeat(40)),
      /BASE_NOT_ANCESTOR_OF_HEAD/,
    );
  });
});

test("wrong branch and tracked dirty repo are refused", () => {
  fixture(({ repo, handoffs, base, add }) => {
    add("01.md", patch(pathA));
    writeFileSync(join(repo, "docs/state.md"), "dirty\n");
    assert.throws(
      () => previewHandoffBatch(repo, handoffs, base),
      /TRACKED_WORKTREE_DIRTY/,
    );
    git(repo, "checkout", "--", "docs/state.md");
    git(repo, "checkout", "-q", "-b", "unapproved-branch");
    assert.throws(
      () => previewHandoffBatch(repo, handoffs, base),
      /WRONG_DEVELOPMENT_BRANCH/,
    );
  });
});

test("malformed sequential patch cannot mutate original repository", () => {
  fixture(({ repo, handoffs, base, add }) => {
    add("01.md", patch(pathA));
    const malformed = patch(pathB).replace("@@ -0,0 +1 @@", "@@ -3,1 +1 @@");
    add("02.md", malformed, "QD-MP-TEST-BETA");
    assert.throws(
      () => previewHandoffBatch(repo, handoffs, base),
      /SEQUENTIAL_APPLY_CHECK_FAILED/,
    );
    assert.equal(existsSync(join(repo, pathA)), false);
    assert.equal(git(repo, "status", "--porcelain"), "");
  });
});

test("untrusted patch target and duplicate package IDs fail closed", () => {
  fixture(({ repo, handoffs, base, add }) => {
    add("01.md", patch(pathA));
    add("02.md", patch(pathB));
    assert.throws(
      () => previewHandoffBatch(repo, handoffs, base),
      /DUPLICATE_PACKAGE_ID/,
    );
  });
  fixture(({ repo, handoffs, base, add }) => {
    add("01.md", patch("src/H5.ts"));
    assert.throws(
      () => previewHandoffBatch(repo, handoffs, base),
      /UNSAFE_PATCH_PATH/,
    );
  });
});
