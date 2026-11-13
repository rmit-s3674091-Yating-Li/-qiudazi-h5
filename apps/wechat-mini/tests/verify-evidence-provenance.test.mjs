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
import { verifyEvidenceProvenance } from "../scripts/verify-evidence-provenance.mjs";
const head = "a".repeat(40);
const root = mkdtempSync(join(tmpdir(), "qd-provenance-"));
const hash = createHash("sha256").update("evidence").digest("hex");
writeFileSync(join(root, "proof.log"), "evidence");
const base = () => ({
  schema: "qd-mini-evidence-v1",
  head,
  artifacts: [{ path: "proof.log", sha256: hash }],
});
test("valid local evidence", () =>
  assert.equal(verifyEvidenceProvenance(base(), root, head).ok, true));
test("wrong head fails closed", () =>
  assert.equal(
    verifyEvidenceProvenance(base(), root, "b".repeat(40)).ok,
    false,
  ));
test("tampered digest fails closed", () => {
  const m = base();
  m.artifacts[0].sha256 = "0".repeat(64);
  assert.equal(verifyEvidenceProvenance(m, root, head).ok, false);
});
test("absolute path rejected", () => {
  const m = base();
  m.artifacts[0].path = join(root, "proof.log");
  assert.equal(verifyEvidenceProvenance(m, root, head).ok, false);
});
test("traversal rejected", () => {
  const m = base();
  m.artifacts[0].path = "../proof.log";
  assert.equal(verifyEvidenceProvenance(m, root, head).ok, false);
});
test("duplicate rejected", () => {
  const m = base();
  m.artifacts.push({ ...m.artifacts[0] });
  assert.equal(verifyEvidenceProvenance(m, root, head).ok, false);
});
test("missing rejected", () => {
  const m = base();
  m.artifacts[0].path = "absent.log";
  assert.equal(verifyEvidenceProvenance(m, root, head).ok, false);
});
test("symlink rejected", () => {
  symlinkSync("proof.log", join(root, "link.log"));
  const m = base();
  m.artifacts[0].path = "link.log";
  assert.equal(verifyEvidenceProvenance(m, root, head).ok, false);
});
test("empty evidence rejected", () => {
  const m = base();
  m.artifacts = [];
  assert.equal(verifyEvidenceProvenance(m, root, head).ok, false);
});
test("invalid hash format rejected", () => {
  const m = base();
  m.artifacts[0].sha256 = "bad";
  assert.equal(verifyEvidenceProvenance(m, root, head).ok, false);
});
process.on("exit", () => rmSync(root, { recursive: true, force: true }));
