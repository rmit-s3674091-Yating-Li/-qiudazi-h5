import test from "node:test";
import assert from "node:assert/strict";
import {
  createWechatLoginPort,
  hexIdentifier,
} from "../src/platform/wechat-login-adapter.ts";

test("calls injected login and returns only the one-time code", async () => {
  let options;
  const port = createWechatLoginPort({
    login: async (input) => {
      options = input;
      return { code: "oneTimeCode", errMsg: "login:ok" };
    },
  });
  assert.deepEqual(await port.login(), { code: "oneTimeCode" });
  assert.deepEqual(options, { timeout: 10000 });
});

test("missing runtime fails closed", async () => {
  await assert.rejects(
    createWechatLoginPort(undefined).login(),
    /WX_LOGIN_UNAVAILABLE/,
  );
});

test("rejects inherited and accessor codes without invoking getters", async () => {
  const responses = [
    null,
    { openid: "not-a-code" },
    Object.create({ code: "inherited" }),
    {
      get code() {
        throw new Error("must not read getter");
      },
    },
  ];
  for (const response of responses) {
    const port = createWechatLoginPort({ login: async () => response });
    assert.deepEqual(await port.login(), {});
  }
});

test("encodes secure bytes without a weak random fallback", () => {
  assert.equal(hexIdentifier(new Uint8Array(16).fill(171)), "ab".repeat(16));
  assert.throws(
    () => hexIdentifier(new Uint8Array(8)),
    /SECURE_RANDOM_REQUIRED/,
  );
});
