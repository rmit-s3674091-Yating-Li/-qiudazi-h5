import test from "node:test";
import assert from "node:assert/strict";
import { safeBridgeDiagnostic } from "../src/core/session-bridge-diagnostic.ts";

const sensitive = [
  "wx-code-123",
  "openid-123",
  "refresh-token-123",
  "session-key-123",
];
function assertSafe(phase, reason) {
  const value = safeBridgeDiagnostic(phase, reason);
  assert.equal(value.authReady, false);
  assert.deepEqual(Object.keys(value), [
    "schema",
    "phase",
    "reason",
    "authReady",
    "retryable",
  ]);
  const serialized = JSON.stringify(value);
  for (const secret of sensitive)
    assert.equal(serialized.includes(secret), false);
  return value;
}

test("never logs untrusted backend error strings", () => {
  for (const secret of sensitive)
    assertSafe("CODE_EXCHANGE", `NETWORK ${secret}`);
});
test("never logs untrusted wx.login code as phase", () => {
  for (const secret of sensitive) assertSafe(secret, "TIMEOUT");
});
test("rejects reason and phase enum suffix/prefix spoofing", () => {
  for (const value of [
    "NETWORK ",
    " NETWORK",
    "NETWORK\n",
    "REFRESH\u0000",
    "DENIED:ok",
  ]) {
    const d = assertSafe(value, value);
    assert.equal(d.reason, "INVALID_RESPONSE");
    assert.equal(d.phase, "CODE_EXCHANGE");
  }
});
test("untrusted Error instances are never serialized", () => {
  const e = new Error(sensitive.join(" "));
  assertSafe(e, e);
});
test("objects with malicious coercion hooks are not coerced", () => {
  const hostile = {
    toString() {
      throw Error("should not execute");
    },
    valueOf() {
      throw Error("should not execute");
    },
  };
  assertSafe(hostile, hostile);
});
test("unknown values cannot mark auth ready or retryable", () => {
  for (const input of [null, undefined, 0, true, [], {}, Symbol("secret")]) {
    const d = assertSafe(input, input);
    assert.equal(d.retryable, false);
  }
});
test("all enum pairs retain a non-success outcome", () => {
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
    for (const reason of reasons) {
      const d = assertSafe(phase, reason);
      assert.equal(d.phase, phase);
      assert.equal(d.reason, reason);
      assert.equal(d.retryable, reason === "NETWORK" || reason === "TIMEOUT");
    }
});
