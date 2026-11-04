import test from "node:test";
import assert from "node:assert/strict";
import { PhotoUploadGate } from "../src/core/photo-upload-gate.ts";
import { createTrustedEndpointPolicy } from "../src/core/trusted-endpoint.ts";

const actor = {
  authUserId: "auth-A",
  profileId: "profile-A",
  epoch: "epoch-A",
};
const url = "https://storage.example.test/storage/v1/object/events/source";
const base = () => ({
  operationId: "operation-12345",
  purpose: "event_source",
  url,
  localPath: "wxfile://tmp/photo.jpg",
  expectedActor: actor,
  userConfirmed: true,
});
const selection = () => ({
  localPath: "wxfile://tmp/photo.jpg",
  mimeType: "image/jpeg",
  bytes: 1024,
});
function harness({
  sessionActor = actor,
  inspect = async () => selection(),
} = {}) {
  let uploads = 0;
  let tokens = 0;
  const gate = new PhotoUploadGate(
    { getVerifiedActor: async () => sessionActor },
    {
      upload: async () => {
        uploads++;
        return { status: 201, rawBody: "" };
      },
    },
    createTrustedEndpointPolicy({
      credentialOrigins: ["https://storage.example.test"],
    }),
    inspect,
    async () => {
      tokens++;
      return "header.payload.signature";
    },
    "event_source",
  );
  return {
    gate,
    get uploads() {
      return uploads;
    },
    get tokens() {
      return tokens;
    },
  };
}

test("plain own-data upload with explicit true consent stays transport-only", async () => {
  const h = harness();
  assert.deepEqual(await h.gate.submit(base()), {
    status: "TRANSPORT_ACCEPTED",
  });
  assert.equal(h.uploads, 1);
});

test("literal false consent remains CONSENT_REQUIRED before token or upload", async () => {
  const h = harness();
  assert.deepEqual(await h.gate.submit({ ...base(), userConfirmed: false }), {
    status: "CONSENT_REQUIRED",
  });
  assert.equal(h.tokens, 0);
});

test("inherited true consent is not accepted as explicit user confirmation", async () => {
  const input = Object.assign(Object.create({ userConfirmed: true }), base());
  delete input.userConfirmed;
  const h = harness();
  assert.deepEqual(await h.gate.submit(input), { status: "INVALID_INPUT" });
  assert.equal(h.uploads, 0);
});

test("accessor consent never executes or reaches token source", async () => {
  const input = base();
  let calls = 0;
  Object.defineProperty(input, "userConfirmed", {
    enumerable: true,
    get() {
      calls++;
      return true;
    },
  });
  const h = harness();
  assert.deepEqual(await h.gate.submit(input), { status: "INVALID_INPUT" });
  assert.equal(calls, 0);
  assert.equal(h.tokens, 0);
});

test("inherited actor identity is rejected before inspection", async () => {
  const input = base();
  input.expectedActor = Object.assign(Object.create({ epoch: "epoch-A" }), {
    authUserId: "auth-A",
    profileId: "profile-A",
  });
  const h = harness();
  assert.deepEqual(await h.gate.submit(input), { status: "INVALID_INPUT" });
  assert.equal(h.tokens, 0);
});

test("session actor getter is never invoked", async () => {
  let calls = 0;
  const bad = { ...actor };
  Object.defineProperty(bad, "epoch", {
    enumerable: true,
    get() {
      calls++;
      return "epoch-A";
    },
  });
  const h = harness({ sessionActor: bad });
  assert.deepEqual(await h.gate.submit(base()), { status: "UNVERIFIED" });
  assert.equal(calls, 0);
  assert.equal(h.tokens, 0);
});

test("inherited inspected media bytes are rejected", async () => {
  const h = harness({
    inspect: async () =>
      Object.assign(Object.create({ bytes: 1024 }), {
        localPath: "wxfile://tmp/photo.jpg",
        mimeType: "image/jpeg",
      }),
  });
  assert.deepEqual(await h.gate.submit(base()), {
    status: "INVALID_SELECTION",
  });
  assert.equal(h.tokens, 0);
});

test("inspector getter cannot mutate MIME between validation and upload", async () => {
  let calls = 0;
  const bad = selection();
  Object.defineProperty(bad, "mimeType", {
    enumerable: true,
    get() {
      calls++;
      return calls === 1 ? "image/jpeg" : "image/gif";
    },
  });
  const h = harness({ inspect: async () => bad });
  assert.deepEqual(await h.gate.submit(base()), {
    status: "INVALID_SELECTION",
  });
  assert.equal(calls, 0);
  assert.equal(h.uploads, 0);
});

test("extra credential-like fields are not forwarded to an upload", async () => {
  const h = harness();
  assert.deepEqual(
    await h.gate.submit({ ...base(), access_token: "do-not-copy" }),
    { status: "INVALID_INPUT" },
  );
  assert.equal(h.tokens, 0);
});

test("null-prototype own-data input and actor remain compatible", async () => {
  const input = Object.assign(Object.create(null), base());
  input.expectedActor = Object.assign(Object.create(null), actor);
  const h = harness({
    sessionActor: Object.assign(Object.create(null), actor),
  });
  assert.deepEqual(await h.gate.submit(input), {
    status: "TRANSPORT_ACCEPTED",
  });
  assert.equal(h.uploads, 1);
});

test("revoked or throwing Proxy is rejected without leaking platform details", async () => {
  const h = harness();
  const { proxy, revoke } = Proxy.revocable(base(), {});
  revoke();
  assert.deepEqual(await h.gate.submit(proxy), { status: "INVALID_INPUT" });
  assert.equal(h.uploads, 0);
});
