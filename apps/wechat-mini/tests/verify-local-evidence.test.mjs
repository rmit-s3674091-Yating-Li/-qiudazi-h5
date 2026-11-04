import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { verifyLocalEvidence } from "../scripts/verify-local-evidence.mjs";
const head = "93384522c831b86dc8c6e2fef45454325c4a4a01";
const digest = (x) => createHash("sha256").update(x).digest("hex");
function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "b90-"));
  try {
    mkdirSync(join(dir, "logs"));
    writeFileSync(join(dir, "logs", "test.txt"), "ok");
    const file = { path: "logs/test.txt", sha256: digest("ok") };
    const manifest = { schemaVersion: 1, exactHead: head, files: [file] };
    fn({ dir, file, manifest });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("matching local bytes are verified but not promoted to auth proof", () =>
  fixture(({ dir, manifest }) =>
    assert.equal(
      verifyLocalEvidence(manifest, dir, head).status,
      "LOCAL_BYTES_VERIFIED_ONLY",
    ),
  ));
test("mismatched exact head rejected", () =>
  fixture(({ dir, manifest }) =>
    assert.throws(
      () => verifyLocalEvidence(manifest, dir, "a".repeat(40)),
      /head/,
    ),
  ));
test("changed bytes rejected", () =>
  fixture(({ dir, manifest }) => {
    writeFileSync(join(dir, "logs", "test.txt"), "changed");
    assert.throws(() => verifyLocalEvidence(manifest, dir, head), /digest/);
  }));
test("traversal rejected", () =>
  fixture(({ dir, manifest }) => {
    manifest.files[0].path = "../outside";
    assert.throws(() => verifyLocalEvidence(manifest, dir, head), /path/);
  }));
test("duplicate paths rejected", () =>
  fixture(({ dir, manifest }) => {
    manifest.files.push({ ...manifest.files[0] });
    assert.throws(() => verifyLocalEvidence(manifest, dir, head), /duplicate/);
  }));
test("symlink leaf rejected", () =>
  fixture(({ dir, manifest }) => {
    symlinkSync("test.txt", join(dir, "logs", "link"));
    manifest.files[0].path = "logs/link";
    assert.throws(() => verifyLocalEvidence(manifest, dir, head), /symlink/);
  }));
test("symlink parent rejected", () =>
  fixture(({ dir, manifest }) => {
    symlinkSync("logs", join(dir, "alias"));
    manifest.files[0].path = "alias/test.txt";
    assert.throws(() => verifyLocalEvidence(manifest, dir, head), /symlink/);
  }));
test("empty manifest rejected", () =>
  fixture(({ dir, manifest }) => {
    manifest.files = [];
    assert.throws(() => verifyLocalEvidence(manifest, dir, head), /count/);
  }));
