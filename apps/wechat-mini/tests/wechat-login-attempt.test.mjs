import test from "node:test";
import assert from "node:assert/strict";
import { WechatLoginAttemptGate } from "../src/core/wechat-login-attempt.ts";

const requestId = "0123456789abcdef";
const nonce = "fedcba9876543210";

test("M2 login attempt only prepares an unverified one-time code", async () => {
  const gate = new WechatLoginAttemptGate({
    login: async () => ({ code: "validCode123" }),
  });
  assert.deepEqual(await gate.acquire(requestId, nonce), {
    status: "CODE_READY_FOR_TRUSTED_SERVER",
    attempt: { requestId, nonce, code: "validCode123" },
  });
});

test("M2 login attempt fails closed for invalid identifiers", async () => {
  let calls = 0;
  const gate = new WechatLoginAttemptGate({
    login: async () => {
      calls++;
      return { code: "validCode123" };
    },
  });
  assert.deepEqual(await gate.acquire("weak", nonce), {
    status: "LOGIN_BLOCKED",
    reason: "INVALID_INPUT",
  });
  assert.equal(calls, 0);
});

test("M2 login attempt does not expose a code after cancellation", async () => {
  let resolveLogin;
  const gate = new WechatLoginAttemptGate({
    login: () =>
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
  });
  const pending = gate.acquire(requestId, nonce);
  gate.invalidate();
  resolveLogin({ code: "validCode123" });
  assert.deepEqual(await pending, {
    status: "LOGIN_BLOCKED",
    reason: "STALE_ATTEMPT",
  });
});

test("M2 login attempt rejects missing codes and runtime errors", async () => {
  for (const login of [
    async () => ({ code: "" }),
    async () => {
      throw new Error("platform error");
    },
  ]) {
    const gate = new WechatLoginAttemptGate({ login });
    assert.deepEqual(await gate.acquire(requestId, nonce), {
      status: "LOGIN_BLOCKED",
      reason: "WX_LOGIN_FAILED",
    });
  }
});
