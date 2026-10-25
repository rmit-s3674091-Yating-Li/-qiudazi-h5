import test from "node:test";
import assert from "node:assert/strict";
import {
  MockWechatCodeVerifier,
  MockLegacyProofVerifier,
  MockIdentityServer,
} from "../src/core/identity-mock.ts";

function harness() {
  const clock = () => 1000;
  const codes = new MockWechatCodeVerifier();
  const proofs = new MockLegacyProofVerifier();
  const server = new MockIdentityServer(codes, proofs, clock);
  let next = 0;
  const bind = (subject, legacy) => {
    const id = ++next;
    const code = `code_${id}abcde`;
    const requestId = `request_${id}abcde`;
    const proof = `proof_${id}abcde`;
    codes.register(code, subject);
    assert.deepEqual(
      server.exchange({
        loginCode: code,
        requestId,
        clientNonce: "nonce_123456",
      }),
      { status: "UNBOUND_IDENTITY" },
    );
    proofs.register(proof, {
      legacy,
      requestId,
      subject,
      expiresAt: 10000,
      consentRecorded: true,
    });
    return server.confirmLegacyBinding(requestId, proof, true);
  };
  return { server, bind };
}
const subject = (name, appId = "app_one") => ({
  appId,
  openId: `openid_${name}`,
  unionId: null,
});
const legacy = (name) => ({
  authUserId: `auth_${name}`,
  profileId: `profile_${name}`,
});
const accepted = { status: "SESSION_BRIDGE_UNPROVEN" };
const rejected = { status: "CONFLICT_LOCKED" };

test("one historical profile cannot be claimed by two different OpenIDs", () => {
  const { server, bind } = harness();
  const a = subject("A"),
    b = subject("B"),
    old = legacy("old");
  assert.deepEqual(bind(a, old), accepted);
  assert.deepEqual(bind(b, old), rejected);
  assert.deepEqual(server.inspectBinding(a), old);
  assert.equal(server.inspectBinding(b), null);
});

test("same Auth UUID with a different Profile ID cannot be bound twice", () => {
  const { server, bind } = harness();
  const a = subject("A"),
    b = subject("B");
  assert.deepEqual(bind(a, legacy("old")), accepted);
  assert.deepEqual(
    bind(b, { authUserId: "auth_old", profileId: "profile_different" }),
    rejected,
  );
  assert.equal(server.inspectBinding(b), null);
});

test("same Profile ID with a different Auth UUID cannot be bound twice", () => {
  const { server, bind } = harness();
  const a = subject("A"),
    b = subject("B");
  assert.deepEqual(bind(a, legacy("old")), accepted);
  assert.deepEqual(
    bind(b, { authUserId: "auth_different", profileId: "profile_old" }),
    rejected,
  );
  assert.equal(server.inspectBinding(b), null);
});

test("two independent subjects may bind different legacy profiles", () => {
  const { server, bind } = harness();
  const a = subject("A"),
    b = subject("B");
  assert.deepEqual(bind(a, legacy("old")), accepted);
  assert.deepEqual(bind(b, legacy("other")), accepted);
  assert.deepEqual(server.inspectBinding(a), legacy("old"));
  assert.deepEqual(server.inspectBinding(b), legacy("other"));
});

test("different AppIDs are not silently allowed to claim one legacy profile", () => {
  const { server, bind } = harness();
  const a = subject("A", "app_one"),
    b = subject("B", "app_two");
  assert.deepEqual(bind(a, legacy("old")), accepted);
  assert.deepEqual(bind(b, legacy("old")), rejected);
  assert.deepEqual(server.inspectBinding(a), legacy("old"));
  assert.equal(server.inspectBinding(b), null);
});
