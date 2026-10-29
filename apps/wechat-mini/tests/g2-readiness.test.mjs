import assert from "node:assert/strict";
import test from "node:test";
import {
  G2_EVIDENCE_KEYS,
  evaluateG2Readiness,
} from "../src/core/g2-readiness.ts";

test("G2 remains blocked without real TEST evidence", () => {
  const report = evaluateG2Readiness({});
  assert.equal(report.status, "G2_BLOCKED");
  assert.equal(report.sessionBridge, "SESSION_BRIDGE_UNPROVEN");
  assert.deepEqual(report.missing, G2_EVIDENCE_KEYS);
});

test("mock identity success cannot substitute for a Supabase session", () => {
  const report = evaluateG2Readiness({
    wechatCodeSingleUse: true,
    legacyProfileUnique: true,
    duplicateProfileRejected: true,
    pageReturnOnWechatDevtools: true,
  });
  assert.equal(report.status, "G2_BLOCKED");
  assert.equal(report.sessionBridge, "SESSION_BRIDGE_UNPROVEN");
  assert.ok(report.missing.includes("supabaseUserVerified"));
  assert.ok(report.missing.includes("refreshRotationVerified"));
  assert.ok(report.missing.includes("foreignRlsDenied"));
});

test("all independent identity, authorization, media and runtime probes are required", () => {
  const evidence = Object.fromEntries(
    G2_EVIDENCE_KEYS.map((key) => [key, true]),
  );
  const report = evaluateG2Readiness(evidence);
  assert.deepEqual(report, {
    status: "G2_READY_FOR_TEST",
    missing: [],
    sessionBridge: "SESSION_VERIFIED",
  });

  for (const key of G2_EVIDENCE_KEYS) {
    const incomplete = { ...evidence, [key]: false };
    const blocked = evaluateG2Readiness(incomplete);
    assert.equal(blocked.status, "G2_BLOCKED");
    assert.deepEqual(blocked.missing, [key]);
  }
});
