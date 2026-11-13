import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  parseQueuedHandoff,
  previewHandoffDependencyChain,
} from "../scripts/preview-handoff-dependency-chain.mjs";

const target = "apps/wechat-mini/src/core/example.ts";
const base = "export const count = 0;";
const first = "export const count = 1;";
const second = "export const count = 2;";

function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function patch(from, to, path = target) {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-${from}\n+${to}\n`;
}

function handoff(
  id,
  diff,
  head,
  { markdown = false, status = "CHAT_WRITE_REQUIRED / NOT_APPLIED" } = {},
) {
  const digest = createHash("sha256").update(diff).digest("hex");
  if (markdown)
    return `- \`PATCH_PACKAGE_ID\`: \`${id}\`\n- \`STATUS\`: \`${status}\`\n- \`BASE_HEAD\`: \`${head}\`\n- \`PATCH_SHA256\`: \`${digest}\`\n\n\`\`\`diff\n${diff}\`\`\`\n`;
  return `PATCH_PACKAGE_ID=${id}\nSTATUS=${status}\nBASE_SHA=${head}\nPATCH_SHA256=${digest}\n\n\`\`\`diff\n${diff}\`\`\`\n`;
}

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), "qdmp-chain-test-"));
  const repo = join(root, "repo");
  const handoffs = join(root, "handoffs");
  const manifest = join(root, "plan.json");
  try {
    mkdirSync(join(repo, "apps/wechat-mini/src/core"), { recursive: true });
    mkdirSync(handoffs);
    git(repo, "init", "-q", "-b", "feature/v8-confirmed-20261011");
    writeFileSync(join(repo, target), `${base}\n`);
    git(repo, "add", ".");
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
    const head = git(repo, "rev-parse", "HEAD");
    const entries = [];
    function add(id, diff, options = {}) {
      const file = `${id}.md`;
      const source = handoff(`QD-MP-${id}-OFFLINE`, diff, head, options);
      writeFileSync(join(handoffs, file), source);
      entries.push({
        id,
        file,
        sha256: createHash("sha256").update(diff).digest("hex"),
        dependsOn: options.dependsOn ?? [],
      });
      return file;
    }
    function run(entriesOverride = entries, baseSha = head) {
      writeFileSync(
        manifest,
        JSON.stringify({
          schemaVersion: 1,
          baseSha,
          packages: entriesOverride,
        }),
      );
      return previewHandoffDependencyChain(repo, handoffs, manifest);
    }
    fn({ root, repo, handoffs, manifest, head, add, run, entries });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("explicit dependency allows sequential overlapping files without repository mutation", () => {
  fixture(({ repo, add, run }) => {
    add("B58", patch(base, first));
    add("B69", patch(first, second), { dependsOn: ["B58"] });
    const report = run();
    assert.equal(report.readiness, "ORDERED_REHEARSAL_PASSED");
    assert.deepEqual(report.changedPaths, [target]);
    assert.equal(report.originalRepoWritten, false);
    assert.equal(report.realAuth, "SESSION_BRIDGE_UNPROVEN");
    assert.equal(readFileSync(join(repo, target), "utf8"), `${base}\n`);
    assert.equal(git(repo, "status", "--porcelain"), "");
  });
});

test("markdown metadata format and base head are accepted", () => {
  fixture(({ add, run }) => {
    add("B63", patch(base, first), { markdown: true });
    assert.equal(run().readiness, "ORDERED_REHEARSAL_PASSED");
  });
});

test("overlap without explicit direct dependency fails closed", () => {
  fixture(({ add, run }) => {
    add("B58", patch(base, first));
    add("B69", patch(first, second));
    assert.throws(run, /UNDECLARED_OVERLAP/);
  });
});

test("wrong patch order cannot pass even if dependency manifest is otherwise valid", () => {
  fixture(({ add, run }) => {
    add("B70", patch(first, second));
    assert.throws(run, /COMMAND_FAILED:git:apply/);
  });
});

test("base HEAD mismatch is rejected", () => {
  fixture(({ add, run }) => {
    add("B58", patch(base, first));
    assert.throws(() => run(undefined, "a".repeat(40)), /STALE_HEAD/);
  });
});

test("digest mismatch is rejected before git apply", () => {
  fixture(({ add, run, entries }) => {
    add("B58", patch(base, first));
    const tampered = [{ ...entries[0], sha256: "0".repeat(64) }];
    assert.throws(() => run(tampered), /BASE_OR_DIGEST_MISMATCH/);
  });
});

test("non-pending status is not consumable", () => {
  fixture(({ add, run }) => {
    add("B58", patch(base, first), { status: "IMPLEMENTED" });
    assert.throws(run, /NOT_PENDING/);
  });
});

test("unsafe traversal target is rejected by parser", () => {
  fixture(({ head }) => {
    const source = handoff(
      "QD-MP-UNSAFE",
      patch(base, first, "apps/wechat-mini/../README.md"),
      head,
    );
    assert.throws(() => parseQueuedHandoff(source), /UNSAFE_PATCH_TARGET/);
  });
});

test("non-regular symlink handoff is rejected", () => {
  fixture(({ root, handoffs, head, run, entries }) => {
    const diff = patch(base, first);
    const file = join(root, "outside.md");
    writeFileSync(file, handoff("QD-MP-SYMLINK", diff, head));
    symlinkSync(file, join(handoffs, "B58.md"));
    entries.push({
      id: "B58",
      file: "B58.md",
      sha256: createHash("sha256").update(diff).digest("hex"),
      dependsOn: [],
    });
    assert.throws(run, /UNSAFE_INPUT_FILE/);
  });
});

test("manifest path traversal is rejected", () => {
  fixture(({ add, run, entries }) => {
    add("B58", patch(base, first));
    assert.throws(
      () => run([{ ...entries[0], file: "../B58.md" }]),
      /INVALID_PACKAGE_ENTRY/,
    );
  });
});

test("untracked target collision is rejected", () => {
  fixture(({ repo, add, run }) => {
    const newTarget = "apps/wechat-mini/src/core/new.ts";
    const diff = `diff --git a/${newTarget} b/${newTarget}\nnew file mode 100644\n--- /dev/null\n+++ b/${newTarget}\n@@ -0,0 +1 @@\n+export const newValue = true;\n`;
    add("B58", diff);
    writeFileSync(join(repo, newTarget), "local untracked\n");
    assert.throws(run, /UNTRACKED_TARGET_COLLISION/);
  });
});

test("new regular file can be rehearsed without changing the original repo", () => {
  fixture(({ repo, add, run }) => {
    const newTarget = "apps/wechat-mini/src/core/new.ts";
    const diff = `diff --git a/${newTarget} b/${newTarget}\nnew file mode 100644\n--- /dev/null\n+++ b/${newTarget}\n@@ -0,0 +1 @@\n+export const newValue = true;\n`;
    add("B58", diff);
    const report = run();
    assert.deepEqual(report.changedPaths, [newTarget]);
    assert.equal(git(repo, "status", "--porcelain"), "");
  });
});

test("non-regular new file mode is blocked", () => {
  fixture(({ head }) => {
    const newTarget = "apps/wechat-mini/src/core/new.ts";
    const diff = `diff --git a/${newTarget} b/${newTarget}\nnew file mode 120000\n--- /dev/null\n+++ b/${newTarget}\n@@ -0,0 +1 @@\n+README.md\n`;
    assert.throws(
      () => parseQueuedHandoff(handoff("QD-MP-MODE", diff, head)),
      /UNSAFE_NEW_FILE_MODE/,
    );
  });
});

test("duplicate package IDs are rejected", () => {
  fixture(({ add, run, entries }) => {
    add("B58", patch(base, first));
    add("B69", patch(first, second), { dependsOn: ["B58"] });
    assert.throws(
      () => run([entries[0], { ...entries[1], id: "B58" }]),
      /INVALID_PACKAGE_ENTRY/,
    );
  });
});

test("a declared dependency cannot point forward", () => {
  fixture(({ add, run, entries }) => {
    add("B58", patch(base, first));
    assert.throws(
      () => run([{ ...entries[0], dependsOn: ["B69"] }]),
      /INVALID_PACKAGE_ENTRY/,
    );
  });
});

test("malformed manifest cannot be treated as an integration success", () => {
  fixture(({ add, run, entries }) => {
    add("B58", patch(base, first));
    assert.throws(
      () => run([{ ...entries[0], sha256: "bad" }]),
      /INVALID_PACKAGE_ENTRY/,
    );
  });
});

test("a duplicate metadata field is rejected", () => {
  fixture(({ head }) => {
    const source = `${handoff("QD-MP-DUPLICATE", patch(base, first), head)}\nSTATUS=CHAT_WRITE_REQUIRED\n`;
    assert.throws(() => parseQueuedHandoff(source), /DUPLICATE_FIELD:STATUS/);
  });
});

test("wrong branch cannot be rehearsed", () => {
  fixture(({ repo, add, run }) => {
    add("B58", patch(base, first));
    git(repo, "checkout", "-qb", "not-approved-branch");
    assert.throws(run, /WRONG_BRANCH/);
  });
});

test("symlink target is rejected", () => {
  fixture(({ repo, add, run }) => {
    const symlinkTarget = "apps/wechat-mini/src/core/linked.ts";
    symlinkSync("example.ts", join(repo, symlinkTarget));
    add("B58", patch(base, first, symlinkTarget));
    assert.throws(run, /SYMLINK_PATCH_TARGET/);
  });
});

test("oversized or malformed handoff never passes parsing", () => {
  assert.throws(
    () => parseQueuedHandoff("a".repeat(512_001)),
    /INVALID_HANDOFF_SIZE/,
  );
  assert.throws(
    () =>
      parseQueuedHandoff(
        "PATCH_PACKAGE_ID=QD-MP-TEST\nSTATUS=CHAT_WRITE_REQUIRED",
      ),
    /INVALID_BASE_HEAD/,
  );
});
