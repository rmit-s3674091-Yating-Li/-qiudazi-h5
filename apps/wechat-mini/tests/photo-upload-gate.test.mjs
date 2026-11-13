import test from "node:test";
import assert from "node:assert/strict";
import { PhotoUploadGate } from "../src/core/photo-upload-gate.ts";
import { UnprovenSessionPort } from "../src/core/ports.ts";
import { createTrustedEndpointPolicy } from "../src/core/trusted-endpoint.ts";

const actorA = {
  authUserId: "auth-A",
  profileId: "profile-A",
  epoch: "epoch-A",
};
const actorB = {
  authUserId: "auth-B",
  profileId: "profile-B",
  epoch: "epoch-B",
};
const endpoint = "https://storage.example.test/storage/v1/object/events/source";
const policy = createTrustedEndpointPolicy({
  credentialOrigins: ["https://storage.example.test"],
});
const input = (extra = {}) => ({
  operationId: "upload-123456",
  purpose: "event_source",
  url: endpoint,
  localPath: "wxfile://tmp/photo-123.jpg",
  expectedActor: actorA,
  userConfirmed: true,
  ...extra,
});
function fixture({ session, inspect, token, upload } = {}) {
  let current = actorA;
  const spy = { uploads: 0, inspected: 0, tokens: 0 };
  const sessionPort = session ?? {
    async getVerifiedActor() {
      return current;
    },
  };
  const inspectPort =
    inspect ??
    (async (path) => {
      spy.inspected++;
      return { localPath: path, mimeType: "image/jpeg", bytes: 4096 };
    });
  const tokenPort =
    token ??
    (async () => {
      spy.tokens++;
      return "header.payload.signature";
    });
  const uploadPort =
    upload ??
    (async () => {
      spy.uploads++;
      return { status: 201, rawBody: "private-data" };
    });
  const gate = new PhotoUploadGate(
    sessionPort,
    { upload: uploadPort },
    policy,
    inspectPort,
    tokenPort,
    "event_source",
  );
  return {
    gate,
    spy,
    setActor(value) {
      current = value;
    },
  };
}

test("offline UnprovenSessionPort cannot upload or request a JWT", async () => {
  const f = fixture({ session: new UnprovenSessionPort() });
  assert.deepEqual(await f.gate.submit(input()), { status: "UNVERIFIED" });
  assert.equal(f.spy.uploads, 0);
  assert.equal(f.spy.tokens, 0);
});

test("only literal boolean true counts as explicit per-action consent", async () => {
  for (const consent of ["yes", 1, {}, null, false]) {
    const f = fixture();
    assert.deepEqual(await f.gate.submit(input({ userConfirmed: consent })), {
      status: "CONSENT_REQUIRED",
    });
    assert.equal(f.spy.inspected, 0);
    assert.equal(f.spy.uploads, 0);
  }
});

test("rejects bad operation, purpose, local path and untrusted upload origin", async () => {
  for (const override of [
    { operationId: "x" },
    { purpose: "profile_avatar" },
    { localPath: "../secrets" },
    { localPath: "wxfile://tmp/../private" },
    { url: "https://storage.example.test.evil.invalid/path" },
    { url: "http://storage.example.test/path" },
    { expectedActor: { ...actorA, epoch: "" } },
  ]) {
    const f = fixture();
    assert.deepEqual(await f.gate.submit(input(override)), {
      status: "INVALID_INPUT",
    });
    assert.equal(f.spy.uploads, 0);
  }
});

test("invalid or throwing media inspection never reaches token source", async () => {
  for (const inspect of [
    async () => ({
      localPath: "wxfile://tmp/other.jpg",
      mimeType: "image/jpeg",
      bytes: 2,
    }),
    async (path) => ({ localPath: path, mimeType: "image/gif", bytes: 2 }),
    async (path) => ({
      localPath: path,
      mimeType: "image/png",
      bytes: 20_000_000,
    }),
    async () => {
      throw new Error("secret media path");
    },
  ]) {
    const f = fixture({ inspect });
    assert.deepEqual(await f.gate.submit(input()), {
      status: "INVALID_SELECTION",
    });
    assert.equal(f.spy.tokens, 0);
    assert.equal(f.spy.uploads, 0);
  }
});

test("actor mismatch before inspection fails closed", async () => {
  const f = fixture();
  f.setActor(actorB);
  assert.deepEqual(await f.gate.submit(input()), { status: "STALE_ACTOR" });
  assert.equal(f.spy.inspected, 0);
});

test("actor switch during async inspection fails before token or upload", async () => {
  let release;
  const inspection = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({ inspect: () => inspection });
  const pending = f.gate.submit(input());
  await new Promise((resolve) => setImmediate(resolve));
  f.setActor(actorB);
  release({ localPath: input().localPath, mimeType: "image/jpeg", bytes: 4 });
  assert.deepEqual(await pending, { status: "STALE_ACTOR" });
  assert.equal(f.spy.tokens, 0);
  assert.equal(f.spy.uploads, 0);
});

test("actor switch during token acquisition fails before upload", async () => {
  let release;
  const token = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({ token: () => token });
  const pending = f.gate.submit(input());
  await new Promise((resolve) => setImmediate(resolve));
  f.setActor(actorB);
  release("header.payload.signature");
  assert.deepEqual(await pending, { status: "STALE_ACTOR" });
  assert.equal(f.spy.uploads, 0);
});

test("concurrent second click is rejected while first upload is pending", async () => {
  let release;
  const uploading = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({
    upload: () => {
      f.spy.uploads++;
      return uploading;
    },
  });
  const first = f.gate.submit(input());
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await f.gate.submit(input()), { status: "BUSY" });
  release({ status: 200, rawBody: "" });
  assert.deepEqual(await first, { status: "TRANSPORT_ACCEPTED" });
  assert.equal(f.spy.uploads, 1);
});

test("transport success is not an Auth or Storage success claim; same operation cannot replay", async () => {
  const f = fixture();
  assert.deepEqual(await f.gate.submit(input()), {
    status: "TRANSPORT_ACCEPTED",
  });
  assert.deepEqual(await f.gate.submit(input()), { status: "REPLAY_REJECTED" });
  assert.equal(f.spy.uploads, 1);
});

test("transport failure remains ambiguous and does not silently retry", async () => {
  const f = fixture({
    upload: async () => {
      throw new Error("secret response body");
    },
  });
  assert.deepEqual(await f.gate.submit(input()), { status: "UPLOAD_FAILED" });
  assert.deepEqual(await f.gate.submit(input()), { status: "REPLAY_REJECTED" });
});

test("non-2xx is not success and JWT errors never leak their value", async () => {
  const f = fixture({
    upload: async () => ({ status: 403, rawBody: "jwt-private" }),
  });
  assert.deepEqual(await f.gate.submit(input()), { status: "UPLOAD_FAILED" });
  const bad = fixture({ token: async () => "secret token with whitespace" });
  assert.deepEqual(await bad.gate.submit(input()), { status: "UNVERIFIED" });
  assert.equal(bad.spy.uploads, 0);
});

test("account switch after request dispatch returns stale, not a success claim", async () => {
  let release;
  const uploading = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({
    upload: () => {
      f.spy.uploads++;
      return uploading;
    },
  });
  const pending = f.gate.submit(input());
  await new Promise((resolve) => setImmediate(resolve));
  f.setActor(actorB);
  release({ status: 201, rawBody: "" });
  assert.deepEqual(await pending, { status: "STALE_ACTOR" });
  assert.equal(f.spy.uploads, 1, "remote side effect cannot be undone");
});

test("malformed input and throwing session fail closed", async () => {
  const f = fixture();
  assert.deepEqual(await f.gate.submit(null), { status: "INVALID_INPUT" });
  const g = fixture({
    session: {
      async getVerifiedActor() {
        throw Error("private");
      },
    },
  });
  assert.deepEqual(await g.gate.submit(input()), { status: "UNVERIFIED" });
});

test("B23 credential-in-URL guard prevents invoking the upload port", async () => {
  const f = fixture();
  const leak = input({ url: `${endpoint}/header.payload.signature` });
  assert.deepEqual(await f.gate.submit(leak), { status: "UPLOAD_FAILED" });
  assert.equal(f.spy.uploads, 0);
});

test("personal copy cannot be submitted through an event-source controller", async () => {
  const f = fixture();
  assert.deepEqual(await f.gate.submit(input({ purpose: "personal_copy" })), {
    status: "INVALID_INPUT",
  });
  assert.equal(f.spy.uploads, 0);
});
