import test from "node:test";
import assert from "node:assert/strict";
import {
  MockWechatCodeVerifier,
  MockLegacyProofVerifier,
  MockIdentityServer,
} from "../src/core/identity-mock.ts";

const subject = { appId: "mini-app", openId: "openid-123", unionId: null };
const legacy = { authUserId: "auth-old", profileId: "profile-stable" };
const request = {
  loginCode: "code-123456",
  requestId: "request-123456",
  clientNonce: "nonce-123456",
};
const fixture = (expiresAt = 2000) => ({
  legacy,
  requestId: request.requestId,
  subject,
  expiresAt,
  consentRecorded: true,
});

function serverWithClock(readTime) {
  const wx = new MockWechatCodeVerifier();
  const proofs = new MockLegacyProofVerifier();
  const server = new MockIdentityServer(wx, proofs, readTime, 100);
  wx.register(request.loginCode, subject);
  return { server, proofs };
}

test("standalone proof verifier burns proof on invalid time instead of accepting it", () => {
  for (const now of [
    NaN,
    Infinity,
    -Infinity,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const proofs = new MockLegacyProofVerifier();
    proofs.register("proof-123456", fixture());
    assert.equal(
      proofs.consume("proof-123456", request.requestId, subject, now),
      null,
    );
    assert.equal(
      proofs.consume("proof-123456", request.requestId, subject, 1000),
      null,
    );
  }
});

test("standalone proof verifier rejects malformed audience and consumes proof", () => {
  const proofs = new MockLegacyProofVerifier();
  proofs.register("proof-123456", fixture());
  assert.equal(
    proofs.consume("proof-123456", request.requestId, null, 1000),
    null,
  );
  assert.equal(
    proofs.consume("proof-123456", request.requestId, subject, 1000),
    null,
  );
});

test("proof registration rejects invalid fixture and fractional expiry", () => {
  const proofs = new MockLegacyProofVerifier();
  for (const invalid of [
    null,
    undefined,
    { ...fixture(), legacy: null },
    fixture(1000.5),
    fixture(-1),
  ]) {
    assert.throws(
      () => proofs.register("proof-123456", invalid),
      /INVALID_PROOF_FIXTURE/,
    );
  }
  proofs.register("proof-123456", fixture());
  assert.deepEqual(
    proofs.consume("proof-123456", request.requestId, subject, 1000),
    legacy,
  );
});

test("throwing exchange clock returns conflict without burning an unused code", () => {
  let shouldThrow = true;
  const { server } = serverWithClock(() => {
    if (shouldThrow) throw new Error("clock unavailable");
    return 1000;
  });
  assert.deepEqual(server.exchange(request), { status: "CONFLICT_LOCKED" });
  shouldThrow = false;
  assert.deepEqual(server.exchange(request), { status: "UNBOUND_IDENTITY" });
});

test("throwing binding clock revokes pending challenge and never creates a binding", () => {
  let shouldThrow = false;
  const { server, proofs } = serverWithClock(() => {
    if (shouldThrow) throw new Error("clock unavailable");
    return 1000;
  });
  assert.deepEqual(server.exchange(request), { status: "UNBOUND_IDENTITY" });
  proofs.register("proof-123456", fixture());
  shouldThrow = true;
  assert.deepEqual(
    server.confirmLegacyBinding(request.requestId, "proof-123456", true),
    { status: "CONFLICT_LOCKED" },
  );
  shouldThrow = false;
  assert.deepEqual(
    server.confirmLegacyBinding(request.requestId, "proof-123456", true),
    { status: "CONFLICT_LOCKED" },
  );
  assert.equal(server.inspectBinding(subject), null);
});

test("valid explicit binding still preserves legacy identifiers and does not mint session", () => {
  const { server, proofs } = serverWithClock(() => 1000);
  assert.deepEqual(server.exchange(request), { status: "UNBOUND_IDENTITY" });
  proofs.register("proof-123456", fixture());
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
