import assert from "node:assert/strict";
import test from "node:test";
import {
  MockIdentityServer,
  MockLegacyProofVerifier,
  MockWechatCodeVerifier,
} from "../src/core/identity-mock.ts";

const subject = (appId = "wx_app_001", openId = "openid_001") => ({
  appId,
  openId,
  unionId: "same_union_id",
});
const legacy = (authUserId = "auth_G", profileId = "profile_G") => ({
  authUserId,
  profileId,
});
const request = (id = "request_001", code = "code_001") => ({
  loginCode: code,
  requestId: id,
  clientNonce: "nonce_001",
});
const setup = (clock = { now: 100 }) => {
  const wechat = new MockWechatCodeVerifier();
  const proofs = new MockLegacyProofVerifier();
  const server = new MockIdentityServer(
    wechat,
    proofs,
    () => {
      if (clock.error) throw new Error("private clock message");
      return clock.now;
    },
    1000,
  );
  wechat.register("code_001", subject());
  assert.deepEqual(server.exchange(request()), { status: "UNBOUND_IDENTITY" });
  return { server, wechat, proofs, clock };
};
const proof = (proofs, id = "proof_001", opts = {}) =>
  proofs.register(id, {
    legacy: legacy(),
    requestId: "request_001",
    subject: subject(),
    expiresAt: 500,
    consentRecorded: true,
    ...opts,
  });
const lock = { status: "CONFLICT_LOCKED" };
const confirm = (
  server,
  proofId = "proof_001",
  confirmed = true,
  id = "request_001",
) => server.confirmLegacyBinding(id, proofId, confirmed);

// The previous implementation returned CONFLICT_LOCKED but retained the pending
// request, allowing a later proof to bind the very same request ID.
test("explicit decline is terminal and cannot later be confirmed", () => {
  const { server, proofs } = setup();
  proof(proofs);
  assert.deepEqual(confirm(server, "proof_001", false), lock);
  assert.deepEqual(confirm(server), lock);
  assert.deepEqual(server.exchange(request()), lock);
  assert.equal(server.inspectBinding(subject()), null);
});

test("unknown proof locks the request against later valid proof", () => {
  const { server, proofs } = setup();
  proof(proofs);
  assert.deepEqual(confirm(server, "unknown_proof"), lock);
  assert.deepEqual(confirm(server), lock);
  assert.deepEqual(server.exchange(request()), lock);
  assert.equal(server.inspectBinding(subject()), null);
});

test("wrong subject proof locks request without aliasing a profile", () => {
  const { server, proofs } = setup();
  proof(proofs, "proof_001", { subject: subject("wx_other_001") });
  assert.deepEqual(confirm(server), lock);
  assert.deepEqual(server.exchange(request()), lock);
  assert.equal(server.inspectBinding(subject()), null);
});

test("wrong request proof locks the pending attempt", () => {
  const { server, proofs } = setup();
  proof(proofs, "proof_001", { requestId: "request_999" });
  assert.deepEqual(confirm(server), lock);
  assert.deepEqual(server.exchange(request()), lock);
});

test("expired legacy proof locks request and preserves ownership", () => {
  const { server, proofs } = setup();
  proof(proofs, "proof_001", { expiresAt: 100 });
  assert.deepEqual(confirm(server), lock);
  assert.deepEqual(server.exchange(request()), lock);
  assert.equal(server.inspectBinding(subject()), null);
});

test("missing server-side consent locks the attempt", () => {
  const { server, proofs } = setup();
  proof(proofs, "proof_001", { consentRecorded: false });
  assert.deepEqual(confirm(server), lock);
  assert.deepEqual(server.exchange(request()), lock);
});

test("clock exception locks request and hides exception text", () => {
  const clock = { now: 100, error: false };
  const { server, proofs } = setup(clock);
  proof(proofs);
  clock.error = true;
  assert.deepEqual(confirm(server), lock);
  clock.error = false;
  assert.deepEqual(server.exchange(request()), lock);
  assert.equal(server.inspectBinding(subject()), null);
});

test("clock rollback locks request even if time later recovers", () => {
  const clock = { now: 100 };
  const { server, proofs } = setup(clock);
  proof(proofs);
  clock.now = 99;
  assert.deepEqual(confirm(server), lock);
  clock.now = 100;
  assert.deepEqual(server.exchange(request()), lock);
});

test("success preserves Auth UUID/Profile ID, not Admin role", () => {
  const { server, proofs } = setup();
  proof(proofs);
  assert.deepEqual(confirm(server), {
    status: "SESSION_BRIDGE_UNPROVEN",
  });
  assert.deepEqual(server.inspectBinding(subject()), legacy());
  assert.equal("admin" in server.inspectBinding(subject()), false);
  assert.deepEqual(confirm(server), lock);
  assert.deepEqual(server.exchange(request()), {
    status: "SESSION_BRIDGE_UNPROVEN",
  });
});

test("fresh wx code and request recover from terminal failure", () => {
  const { server, proofs, wechat } = setup();
  assert.deepEqual(confirm(server, "unknown_proof"), lock);
  wechat.register("code_002", subject());
  const fresh = request("request_002", "code_002");
  assert.deepEqual(server.exchange(fresh), { status: "UNBOUND_IDENTITY" });
  proofs.register("proof_002", {
    legacy: legacy(),
    requestId: "request_002",
    subject: subject(),
    expiresAt: 500,
    consentRecorded: true,
  });
  assert.deepEqual(confirm(server, "proof_002", true, "request_002"), {
    status: "SESSION_BRIDGE_UNPROVEN",
  });
  assert.deepEqual(server.inspectBinding(subject()), legacy());
});

test("second subject cannot claim same legacy Auth UUID/Profile ID", () => {
  const { server, proofs, wechat } = setup();
  proof(proofs);
  assert.equal(confirm(server).status, "SESSION_BRIDGE_UNPROVEN");
  const other = subject("wx_app_002", "openid_002");
  wechat.register("code_002", other);
  assert.equal(
    server.exchange(request("request_002", "code_002")).status,
    "UNBOUND_IDENTITY",
  );
  proofs.register("proof_002", {
    legacy: legacy(),
    requestId: "request_002",
    subject: other,
    expiresAt: 500,
    consentRecorded: true,
  });
  assert.deepEqual(confirm(server, "proof_002", true, "request_002"), lock);
  assert.deepEqual(server.exchange(request("request_002", "code_002")), lock);
  assert.equal(server.inspectBinding(other), null);
  assert.deepEqual(server.inspectBinding(subject()), legacy());
});

test("locking one request preserves an independent pending request", () => {
  const { server, proofs, wechat } = setup();
  const other = subject("wx_app_002", "openid_002");
  wechat.register("code_002", other);
  const req2 = request("request_002", "code_002");
  assert.equal(server.exchange(req2).status, "UNBOUND_IDENTITY");
  proofs.register("proof_002", {
    legacy: legacy("auth_B", "profile_B"),
    requestId: "request_002",
    subject: other,
    expiresAt: 500,
    consentRecorded: true,
  });
  assert.deepEqual(confirm(server, "unknown_proof"), lock);
  assert.deepEqual(confirm(server, "proof_002", true, "request_002"), {
    status: "SESSION_BRIDGE_UNPROVEN",
  });
  assert.deepEqual(server.inspectBinding(other), legacy("auth_B", "profile_B"));
});
