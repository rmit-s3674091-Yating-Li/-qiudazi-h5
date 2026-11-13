import test from "node:test";
import assert from "node:assert/strict";
import { classify, GATES } from "../scripts/verify-acceptance-evidence.mjs";
const head = "93384522c831b86dc8c6e2fef45454325c4a4a01";
const all = () =>
  Object.fromEntries(
    Object.values(GATES)
      .flat()
      .map((k) => [k, { status: "PASS", reference: "reviewable:fixture" }]),
  );
const make = (evidence) => ({ schemaVersion: 1, exactHead: head, evidence });
test("empty evidence never passes", () =>
  assert.deepEqual(classify(make({})), {
    source: "UNVERIFIED",
    auth: "UNVERIFIED",
    release: "UNVERIFIED",
    sessionBridge: "SESSION_BRIDGE_UNPROVEN",
    publish: "NOT_AUTHORIZED",
  }));
test("source-only evidence cannot imply auth or release", () => {
  const e = all();
  for (const k of [...GATES.auth, ...GATES.release]) delete e[k];
  const r = classify(make(e));
  assert.equal(r.source, "PASS");
  assert.equal(r.auth, "UNVERIFIED");
  assert.equal(r.publish, "NOT_AUTHORIZED");
});
test("explicit failure cannot be overwritten by missing evidence", () => {
  const e = all();
  e.supabaseRefresh = { status: "FAIL", reference: "test:failed" };
  delete e.wechatCodeVerified;
  assert.equal(classify(make(e)).auth, "FAIL");
});
test("unknown key fails closed", () =>
  assert.throws(
    () =>
      classify(
        make({ ...all(), serviceRoleKey: { status: "PASS", reference: "x" } }),
      ),
    /unknown/,
  ));
test("no empty references", () => {
  const e = all();
  e.taroBuild.reference = " ";
  assert.equal(classify(make(e)).source, "UNVERIFIED");
});
test("even all self-reported passes require independent review and approval", () => {
  const r = classify(make(all()));
  assert.equal(r.sessionBridge, "EVIDENCE_REVIEW_REQUIRED");
  assert.equal(r.publish, "MANUAL_APPROVAL_REQUIRED");
});
test("invalid head rejected", () =>
  assert.throws(
    () => classify({ ...make(all()), exactHead: "9338452" }),
    /head/,
  ));
