import assert from "node:assert/strict";
import test from "node:test";
import {
  MockIdentityServer,
  MockLegacyProofVerifier,
  MockWechatCodeVerifier,
} from "../src/core/identity-mock.ts";

const subject = (openId = "openid_001") => ({
  appId: "wx_app_001",
  openId,
  unionId: null,
});
const request = (
  code = "code_001",
  id = "request_001",
  nonce = "nonce_001",
) => ({
  loginCode: code,
  requestId: id,
  clientNonce: nonce,
});
const LOCK = { status: "CONFLICT_LOCKED" };
const setup = (clock = { value: 100, throws: false }) => {
  const wx = new MockWechatCodeVerifier();
  const legacy = new MockLegacyProofVerifier();
  const server = new MockIdentityServer(
    wx,
    legacy,
    () => {
      if (clock.throws) throw Error("clock secret");
      return clock.value;
    },
    1000,
  );
  return { wx, legacy, server, clock };
};
const register = (wx, code = "code_001", id = "openid_001") =>
  wx.register(code, subject(id));
const proof = (legacy, id = "request_001") =>
  legacy.register("proof_001", {
    legacy: { authUserId: "auth_G", profileId: "profile_G" },
    requestId: id,
    subject: subject(),
    expiresAt: 900,
    consentRecorded: true,
  });

test("unregistered mock code burns its request ID", () => {
  const { wx, server } = setup();
  assert.deepEqual(server.exchange(request("unknown_001")), LOCK);
  register(wx, "code_002");
  assert.deepEqual(server.exchange(request("code_002")), LOCK);
  assert.equal(server.inspectBinding(subject()), null);
});

test("failed code exchange cannot be rescued with another nonce", () => {
  const { wx, server } = setup();
  assert.deepEqual(server.exchange(request("unknown_001")), LOCK);
  register(wx, "code_002");
  assert.deepEqual(
    server.exchange(request("code_002", "request_001", "nonce_002")),
    LOCK,
  );
});

test("same valid request is idempotent until an explicit conflict", () => {
  const { wx, server } = setup();
  register(wx);
  assert.equal(server.exchange(request()).status, "UNBOUND_IDENTITY");
  assert.equal(server.exchange(request()).status, "UNBOUND_IDENTITY");
});

test("changed nonce terminates pending exchange and its binding", () => {
  const { wx, legacy, server } = setup();
  register(wx);
  assert.equal(server.exchange(request()).status, "UNBOUND_IDENTITY");
  assert.deepEqual(
    server.exchange(request("code_001", "request_001", "nonce_002")),
    LOCK,
  );
  assert.deepEqual(server.exchange(request()), LOCK);
  proof(legacy);
  assert.deepEqual(
    server.confirmLegacyBinding("request_001", "proof_001", true),
    LOCK,
  );
  assert.equal(server.inspectBinding(subject()), null);
});

test("changed code on same request ID is terminal", () => {
  const { wx, server } = setup();
  register(wx);
  assert.equal(server.exchange(request()).status, "UNBOUND_IDENTITY");
  register(wx, "code_002");
  assert.deepEqual(server.exchange(request("code_002")), LOCK);
  assert.deepEqual(server.exchange(request()), LOCK);
});

test("expired request cannot be recycled after time recovers", () => {
  const clock = { value: 100 };
  const { wx, server } = setup(clock);
  register(wx);
  assert.equal(server.exchange(request()).status, "UNBOUND_IDENTITY");
  clock.value = 1100;
  assert.deepEqual(server.exchange(request()), LOCK);
  clock.value = 100;
  register(wx, "code_002");
  assert.deepEqual(server.exchange(request("code_002")), LOCK);
});

test("clock rollback locks request ID permanently in this mock instance", () => {
  const clock = { value: 100 };
  const { wx, server } = setup(clock);
  register(wx);
  assert.equal(server.exchange(request()).status, "UNBOUND_IDENTITY");
  clock.value = 99;
  assert.deepEqual(server.exchange(request()), LOCK);
  clock.value = 100;
  assert.deepEqual(server.exchange(request()), LOCK);
});

test("invalid initial clock locks valid-shaped request ID", () => {
  const clock = { value: NaN };
  const { wx, server } = setup(clock);
  register(wx);
  assert.deepEqual(server.exchange(request()), LOCK);
  clock.value = 100;
  assert.deepEqual(server.exchange(request()), LOCK);
});

test("throwing clock locks request and does not reveal exception", () => {
  const clock = { value: 100, throws: true };
  const { wx, server } = setup(clock);
  register(wx);
  assert.deepEqual(server.exchange(request()), LOCK);
  clock.throws = false;
  assert.deepEqual(server.exchange(request()), LOCK);
});

test("fresh code and request recover from prior terminal exchange", () => {
  const { wx, server } = setup();
  assert.deepEqual(server.exchange(request("unknown_001")), LOCK);
  register(wx, "code_002");
  assert.deepEqual(server.exchange(request("code_002", "request_002")), {
    status: "UNBOUND_IDENTITY",
  });
});

test("terminal conflict on one request preserves independent pending binding", () => {
  const { wx, legacy, server } = setup();
  register(wx);
  register(wx, "code_002", "openid_002");
  assert.equal(server.exchange(request()).status, "UNBOUND_IDENTITY");
  assert.equal(
    server.exchange(request("code_002", "request_002")).status,
    "UNBOUND_IDENTITY",
  );
  assert.deepEqual(
    server.exchange(request("code_001", "request_001", "nonce_002")),
    LOCK,
  );
  legacy.register("proof_002", {
    legacy: { authUserId: "auth_B", profileId: "profile_B" },
    requestId: "request_002",
    subject: subject("openid_002"),
    expiresAt: 900,
    consentRecorded: true,
  });
  assert.equal(
    server.confirmLegacyBinding("request_002", "proof_002", true).status,
    "SESSION_BRIDGE_UNPROVEN",
  );
  assert.deepEqual(server.inspectBinding(subject("openid_002")), {
    authUserId: "auth_B",
    profileId: "profile_B",
  });
  assert.equal(server.inspectBinding(subject()), null);
});

test("successful binding remains mock-only with stable legacy IDs", () => {
  const { wx, legacy, server } = setup();
  register(wx);
  assert.equal(server.exchange(request()).status, "UNBOUND_IDENTITY");
  proof(legacy);
  assert.deepEqual(
    server.confirmLegacyBinding("request_001", "proof_001", true),
    {
      status: "SESSION_BRIDGE_UNPROVEN",
    },
  );
  assert.deepEqual(server.inspectBinding(subject()), {
    authUserId: "auth_G",
    profileId: "profile_G",
  });
  assert.equal("admin" in server.inspectBinding(subject()), false);
  assert.equal(server.exchange(request()).status, "SESSION_BRIDGE_UNPROVEN");
});

test("malformed input does not burn an unrelated valid request", () => {
  const { wx, server } = setup();
  register(wx);
  assert.deepEqual(server.exchange({ ...request(), loginCode: "bad" }), LOCK);
  assert.deepEqual(server.exchange(request()), { status: "UNBOUND_IDENTITY" });
});

test("consumed mock code cannot be replayed under a new request ID", () => {
  const { wx, server } = setup();
  register(wx);
  assert.equal(server.exchange(request()).status, "UNBOUND_IDENTITY");
  assert.deepEqual(server.exchange(request("code_001", "request_002")), LOCK);
});
