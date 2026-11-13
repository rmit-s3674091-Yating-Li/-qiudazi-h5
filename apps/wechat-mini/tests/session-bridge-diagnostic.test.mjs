import test from "node:test";
import assert from "node:assert/strict";
import { safeBridgeDiagnostic } from "../src/core/session-bridge-diagnostic.ts";
const phases = [
  "WX_LOGIN",
  "CODE_EXCHANGE",
  "SUPABASE_SESSION",
  "REFRESH",
  "LEGACY_BIND",
];
const reasons = [
  "UNCONFIGURED",
  "NETWORK",
  "TIMEOUT",
  "INVALID_RESPONSE",
  "SESSION_UNPROVEN",
  "CONFLICT",
  "DENIED",
];
for (const phase of phases)
  test(`safe phase ${phase}`, () => {
    const d = safeBridgeDiagnostic(phase, "SESSION_UNPROVEN");
    assert.equal(d.phase, phase);
    assert.equal(d.authReady, false);
    assert.equal(d.retryable, false);
  });
for (const reason of reasons)
  test(`safe reason ${reason}`, () => {
    const d = safeBridgeDiagnostic("CODE_EXCHANGE", reason);
    assert.equal(d.reason, reason);
    assert.equal(d.retryable, ["NETWORK", "TIMEOUT"].includes(reason));
  });
test("untrusted strings and secret-shaped objects never serialize", () => {
  const secret = {
    code: "wx-secret",
    access_token: "supabase-secret",
    openid: "wx-openid",
    message: "sensitive",
  };
  const d = safeBridgeDiagnostic(secret, secret);
  assert.deepEqual(d, {
    schema: 1,
    phase: "CODE_EXCHANGE",
    reason: "INVALID_RESPONSE",
    authReady: false,
    retryable: false,
  });
  assert.doesNotMatch(
    JSON.stringify(d),
    /wx-secret|supabase-secret|wx-openid|sensitive/,
  );
});
test("injection and prototype-like values are rejected", () => {
  for (const s of ["__proto__", "constructor", "NETWORK\naccess_token=123", ""])
    assert.equal(safeBridgeDiagnostic(s, s).reason, "INVALID_RESPONSE");
});
test("result is frozen and has exact fixed keys", () => {
  const d = safeBridgeDiagnostic("REFRESH", "NETWORK");
  assert.ok(Object.isFrozen(d));
  assert.deepEqual(Object.keys(d), [
    "schema",
    "phase",
    "reason",
    "authReady",
    "retryable",
  ]);
});
