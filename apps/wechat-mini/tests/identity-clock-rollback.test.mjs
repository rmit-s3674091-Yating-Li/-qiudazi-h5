import test from "node:test";
import assert from "node:assert/strict";
import {
  MockWechatCodeVerifier,
  MockLegacyProofVerifier,
  MockIdentityServer,
} from "../src/core/identity-mock.ts";

const subject = { appId: "mini-app", openId: "openid-A", unionId: null };
const legacy = { authUserId: "auth-old", profileId: "profile-stable" };
const request = {
  loginCode: "code-123456",
  requestId: "request-123456",
  clientNonce: "nonce-123456",
};
function harness(initial = 1000, ttl = 100) {
  let clock = initial;
  const wx = new MockWechatCodeVerifier();
  const proofs = new MockLegacyProofVerifier();
  const server = new MockIdentityServer(wx, proofs, () => clock, ttl);
  wx.register(request.loginCode, subject);
  return {
    server,
    proofs,
    setClock: (value) => {
      clock = value;
    },
  };
}

test("malformed exchange input fails closed instead of throwing or consuming a code", () => {
  const { server } = harness();
  for (const invalid of [
    null,
    undefined,
    3,
    {},
    [],
    { ...request, loginCode: null },
  ]) {
    assert.deepEqual(server.exchange(invalid), { status: "CONFLICT_LOCKED" });
  }
  assert.deepEqual(server.exchange(request), { status: "UNBOUND_IDENTITY" });
});

test("replay of an earlier request fails closed if wall clock moves backwards", () => {
  const { server, setClock } = harness();
  assert.deepEqual(server.exchange(request), { status: "UNBOUND_IDENTITY" });
  setClock(900);
  assert.deepEqual(server.exchange(request), { status: "CONFLICT_LOCKED" });
});

test("backwards clock cannot extend a pending legacy-binding challenge", () => {
  const { server, proofs, setClock } = harness();
  assert.deepEqual(server.exchange(request), { status: "UNBOUND_IDENTITY" });
  proofs.register("proof-123456", {
    legacy,
    requestId: request.requestId,
    subject,
    expiresAt: 2000,
    consentRecorded: true,
  });
  setClock(900);
  assert.deepEqual(
    server.confirmLegacyBinding(request.requestId, "proof-123456", true),
    { status: "CONFLICT_LOCKED" },
  );
  assert.equal(server.inspectBinding(subject), null);
  setClock(1001);
  assert.deepEqual(
    server.confirmLegacyBinding(request.requestId, "proof-123456", true),
    { status: "CONFLICT_LOCKED" },
  );
});

test("non-finite clock never creates a binding challenge or verifies a replay", () => {
  const { server, setClock } = harness();
  setClock(Number.NaN);
  assert.deepEqual(server.exchange(request), { status: "CONFLICT_LOCKED" });
  setClock(1000);
  assert.deepEqual(server.exchange(request), { status: "UNBOUND_IDENTITY" });
  setClock(Number.POSITIVE_INFINITY);
  assert.deepEqual(server.exchange(request), { status: "CONFLICT_LOCKED" });
  setClock(1001);
  assert.deepEqual(server.exchange(request), { status: "CONFLICT_LOCKED" });
});

test("normal valid time flow still binds once and never returns real credentials", () => {
  const { server, proofs, setClock } = harness();
  assert.deepEqual(server.exchange(request), { status: "UNBOUND_IDENTITY" });
  setClock(1010);
  assert.deepEqual(server.exchange(request), { status: "UNBOUND_IDENTITY" });
  proofs.register("proof-123456", {
    legacy,
    requestId: request.requestId,
    subject,
    expiresAt: 1100,
    consentRecorded: true,
  });
  const result = server.confirmLegacyBinding(
    request.requestId,
    "proof-123456",
    true,
  );
  assert.deepEqual(result, { status: "SESSION_BRIDGE_UNPROVEN" });
  assert.deepEqual(server.inspectBinding(subject), legacy);
  assert.equal("access_token" in result, false);
  assert.equal("refresh_token" in result, false);
});
