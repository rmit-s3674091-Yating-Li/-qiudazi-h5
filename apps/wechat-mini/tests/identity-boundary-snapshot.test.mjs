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
const legacy = (authUserId = "auth_uuid_G", profileId = "profile_G") => ({
  authUserId,
  profileId,
});
const fixture = (requestId = "request_001", override = {}) => ({
  legacy: legacy(),
  requestId,
  subject: subject(),
  expiresAt: 10_000,
  consentRecorded: true,
  ...override,
});
const setup = () => {
  const wechat = new MockWechatCodeVerifier();
  const proofs = new MockLegacyProofVerifier();
  const server = new MockIdentityServer(wechat, proofs, () => 100, 1_000);
  return { wechat, proofs, server };
};
const login = (server, loginCode = "code_001", requestId = "request_001") =>
  server.exchange({ loginCode, requestId, clientNonce: "nonce_001" });

// Happy-path remains an offline binding protocol, NEVER an Auth session.
test("normal explicit binding preserves the Auth UUID/Profile ID and stays unproven", () => {
  const { wechat, proofs, server } = setup();
  wechat.register("code_001", subject());
  proofs.register("proof_001", fixture());
  assert.deepEqual(login(server), { status: "UNBOUND_IDENTITY" });
  assert.deepEqual(
    server.confirmLegacyBinding("request_001", "proof_001", true),
    {
      status: "SESSION_BRIDGE_UNPROVEN",
    },
  );
  assert.deepEqual(server.inspectBinding(subject()), legacy());
  assert.deepEqual(login(server), { status: "SESSION_BRIDGE_UNPROVEN" });
  assert.equal("admin" in server.inspectBinding(subject()), false);
});

test("a second subject cannot claim an already-bound legacy Auth/Profile identity", () => {
  const { wechat, proofs, server } = setup();
  wechat.register("code_001", subject());
  proofs.register("proof_001", fixture());
  assert.equal(login(server).status, "UNBOUND_IDENTITY");
  assert.equal(
    server.confirmLegacyBinding("request_001", "proof_001", true).status,
    "SESSION_BRIDGE_UNPROVEN",
  );
  wechat.register("code_002", subject("openid_002"));
  proofs.register(
    "proof_002",
    fixture("request_002", { subject: subject("openid_002") }),
  );
  assert.equal(
    login(server, "code_002", "request_002").status,
    "UNBOUND_IDENTITY",
  );
  assert.equal(
    server.confirmLegacyBinding("request_002", "proof_002", true).status,
    "CONFLICT_LOCKED",
  );
  assert.equal(server.inspectBinding(subject("openid_002")), null);
});

test("valid null-prototype subject and optional unionId remain compatible", () => {
  const { wechat, server } = setup();
  const noUnion = Object.assign(Object.create(null), {
    appId: "wx_app_001",
    openId: "openid_001",
  });
  wechat.register("code_001", noUnion);
  assert.deepEqual(login(server), { status: "UNBOUND_IDENTITY" });
});

test("rejects a subject getter without executing it", () => {
  const { wechat } = setup();
  let reads = 0;
  const attack = {
    appId: "wx_app_001",
    unionId: null,
    get openId() {
      reads++;
      return "openid_001";
    },
  };
  assert.throws(() => wechat.register("code_001", attack), /INVALID_MOCK_CODE/);
  assert.equal(reads, 0);
});

test("rejects inherited subject identity", () => {
  const { wechat } = setup();
  const attack = Object.assign(Object.create({ appId: "wx_app_001" }), {
    openId: "openid_001",
    unionId: null,
  });
  assert.throws(() => wechat.register("code_001", attack), /INVALID_MOCK_CODE/);
});

test("rejects subject with extra secret fields and nonenumerable fields", () => {
  const { wechat } = setup();
  assert.throws(
    () =>
      wechat.register("code_001", { ...subject(), session_key: "never-store" }),
    /INVALID_MOCK_CODE/,
  );
  const attack = subject();
  Object.defineProperty(attack, "openid_backup", {
    value: "secret",
    enumerable: false,
  });
  assert.throws(() => wechat.register("code_002", attack), /INVALID_MOCK_CODE/);
});

test("rejects subject with symbol and throwing Proxy", () => {
  const { wechat } = setup();
  assert.throws(
    () => wechat.register("code_001", { ...subject(), [Symbol("secret")]: 1 }),
    /INVALID_MOCK_CODE/,
  );
  assert.throws(
    () =>
      wechat.register(
        "code_002",
        new Proxy(subject(), {
          ownKeys() {
            throw Error("trap");
          },
        }),
      ),
    /INVALID_MOCK_CODE/,
  );
});

test("rejects proof consent getter without running it", () => {
  const { proofs } = setup();
  let reads = 0;
  const attack = fixture();
  Object.defineProperty(attack, "consentRecorded", {
    enumerable: true,
    get() {
      reads++;
      return true;
    },
  });
  assert.throws(
    () => proofs.register("proof_001", attack),
    /INVALID_PROOF_FIXTURE/,
  );
  assert.equal(reads, 0);
});

test("rejects inherited Auth UUID or Profile ID in legacy proof", () => {
  const { proofs } = setup();
  const attack = fixture("request_001", {
    legacy: Object.assign(Object.create({ authUserId: "auth_uuid_G" }), {
      profileId: "profile_G",
    }),
  });
  assert.throws(
    () => proofs.register("proof_001", attack),
    /INVALID_PROOF_FIXTURE/,
  );
});

test("rejects extra credentials and nonboolean consent in proof fixture", () => {
  const { proofs } = setup();
  assert.throws(
    () =>
      proofs.register("proof_001", { ...fixture(), refresh_token: "hidden" }),
    /INVALID_PROOF_FIXTURE/,
  );
  assert.throws(
    () =>
      proofs.register(
        "proof_002",
        fixture("request_002", { consentRecorded: 1 }),
      ),
    /INVALID_PROOF_FIXTURE/,
  );
});

test("rejects changing subject getter on proof without executing it", () => {
  const { proofs } = setup();
  let reads = 0;
  const attack = fixture();
  Object.defineProperty(attack, "subject", {
    enumerable: true,
    get() {
      reads++;
      return subject();
    },
  });
  assert.throws(
    () => proofs.register("proof_001", attack),
    /INVALID_PROOF_FIXTURE/,
  );
  assert.equal(reads, 0);
});

test("rejects nested subject getter and throwing fixture Proxy", () => {
  const { proofs } = setup();
  let reads = 0;
  const attackSubject = {
    ...subject(),
    get openId() {
      reads++;
      return "openid_001";
    },
  };
  assert.throws(
    () =>
      proofs.register(
        "proof_001",
        fixture("request_001", { subject: attackSubject }),
      ),
    /INVALID_PROOF_FIXTURE/,
  );
  assert.equal(reads, 0);
  assert.throws(
    () =>
      proofs.register(
        "proof_002",
        new Proxy(fixture(), {
          getOwnPropertyDescriptor() {
            throw Error("trap");
          },
        }),
      ),
    /INVALID_PROOF_FIXTURE/,
  );
});

test("mutating proof fixture after registration does not alter stored binding", () => {
  const { wechat, proofs, server } = setup();
  const record = fixture();
  proofs.register("proof_001", record);
  record.legacy.profileId = "profile_wrong";
  record.subject.openId = "openid_wrong";
  record.consentRecorded = false;
  wechat.register("code_001", subject());
  assert.equal(login(server).status, "UNBOUND_IDENTITY");
  assert.equal(
    server.confirmLegacyBinding("request_001", "proof_001", true).status,
    "SESSION_BRIDGE_UNPROVEN",
  );
  assert.deepEqual(server.inspectBinding(subject()), legacy());
});

test("rejects inherited exchange login code without consuming registered code", () => {
  const { wechat, server } = setup();
  wechat.register("code_001", subject());
  const attack = Object.assign(Object.create({ loginCode: "code_001" }), {
    requestId: "request_001",
    clientNonce: "nonce_001",
  });
  assert.equal(server.exchange(attack).status, "CONFLICT_LOCKED");
  assert.equal(login(server).status, "UNBOUND_IDENTITY");
});

test("rejects exchange getter without executing it or consuming code", () => {
  const { wechat, server } = setup();
  wechat.register("code_001", subject());
  let reads = 0;
  const attack = {
    get loginCode() {
      reads++;
      return "code_001";
    },
    requestId: "request_001",
    clientNonce: "nonce_001",
  };
  assert.equal(server.exchange(attack).status, "CONFLICT_LOCKED");
  assert.equal(reads, 0);
  assert.equal(login(server).status, "UNBOUND_IDENTITY");
});

test("rejects extra token in exchange payload without consuming code", () => {
  const { wechat, server } = setup();
  wechat.register("code_001", subject());
  assert.equal(
    server.exchange({
      loginCode: "code_001",
      requestId: "request_001",
      clientNonce: "nonce_001",
      access_token: "spoof",
    }).status,
    "CONFLICT_LOCKED",
  );
  assert.equal(login(server).status, "UNBOUND_IDENTITY");
});

test("proof wrong audience consumes once and cannot be replayed", () => {
  const { proofs } = setup();
  proofs.register("proof_001", fixture());
  assert.equal(
    proofs.consume("proof_001", "request_001", subject("openid_002"), 100),
    null,
  );
  assert.equal(
    proofs.consume("proof_001", "request_001", subject(), 100),
    null,
  );
});

test("proof with server-side consent false remains rejected", () => {
  const { wechat, proofs, server } = setup();
  wechat.register("code_001", subject());
  proofs.register(
    "proof_001",
    fixture("request_001", { consentRecorded: false }),
  );
  assert.equal(login(server).status, "UNBOUND_IDENTITY");
  assert.equal(
    server.confirmLegacyBinding("request_001", "proof_001", true).status,
    "CONFLICT_LOCKED",
  );
  assert.equal(server.inspectBinding(subject()), null);
});

test("invalid inspectBinding input cannot trigger inherited identity lookup", () => {
  const { server } = setup();
  const attack = Object.assign(Object.create({ appId: "wx_app_001" }), {
    openId: "openid_001",
  });
  assert.equal(server.inspectBinding(attack), null);
});
