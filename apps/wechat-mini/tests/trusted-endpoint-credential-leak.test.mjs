import test from "node:test";
import assert from "node:assert/strict";
import {
  createTrustedEndpointPolicy,
  guardedNetworkCall,
} from "../src/core/trusted-endpoint.ts";

const origin = "https://mini-fixture.example";
const policy = () =>
  createTrustedEndpointPolicy({ credentialOrigins: [origin] });
const jwt = "eyJhbGciOiJIUzI1NiJ9.mock.payload";

async function assertBlocked(url, credential, expected) {
  let invoked = 0;
  await assert.rejects(
    guardedNetworkCall(policy(), url, credential, async () => {
      invoked++;
      return 200;
    }),
    (error) => error?.message === expected,
  );
  assert.equal(invoked, 0, "platform primitive must not be invoked");
}

test("JWT in URL query is rejected before any request, despite innocuous query key", async () => {
  await assertBlocked(
    `${origin}/rest/v1/events?select=${jwt}`,
    jwt,
    "CREDENTIAL_IN_URL",
  );
});

test("JWT embedded in URL path is rejected before upload or request", async () => {
  await assertBlocked(
    `${origin}/storage/v1/${jwt}/object`,
    jwt,
    "CREDENTIAL_IN_URL",
  );
});

test("single percent-encoded JWT in query is rejected", async () => {
  const escaped = jwt.replaceAll(".", "%2E");
  await assertBlocked(
    `${origin}/rest/v1/events?q=${escaped}`,
    jwt,
    "CREDENTIAL_IN_URL",
  );
});

test("double percent-encoded JWT in query is rejected", async () => {
  const escaped = jwt.replaceAll(".", "%252E");
  await assertBlocked(
    `${origin}/rest/v1/events?q=${escaped}`,
    jwt,
    "CREDENTIAL_IN_URL",
  );
});

test("malformed percent encoding with a credential fails closed", async () => {
  await assertBlocked(
    `${origin}/rest/v1/events?q=%ZZ`,
    jwt,
    "UNTRUSTED_ENDPOINT",
  );
});

test("non-ASCII, whitespace and control characters cannot enter bearer header", async () => {
  for (const token of [
    "bad token",
    "bad\tjwt",
    "bad\u0000jwt",
    "bär",
    "bad:jwt",
  ]) {
    await assertBlocked(`${origin}/auth/v1/user`, token, "INVALID_JWT");
  }
});

test("safe JWT with ordinary encoded query continues to work", async () => {
  let invoked = 0;
  const response = await guardedNetworkCall(
    policy(),
    `${origin}/rest/v1/events?select=id%2Cname`,
    jwt,
    async () => {
      invoked++;
      return { status: 200 };
    },
  );
  assert.deepEqual(response, { status: 200 });
  assert.equal(invoked, 1);
});

test("anonymous request remains independent of bearer credential checks", async () => {
  let invoked = 0;
  await guardedNetworkCall(
    policy(),
    `${origin}/public?q=${jwt}`,
    undefined,
    async () => {
      invoked++;
      return 200;
    },
  );
  assert.equal(invoked, 1);
});

test("upload-required request cannot bypass credential URL check", async () => {
  let invoked = 0;
  await assert.rejects(
    guardedNetworkCall(
      policy(),
      `${origin}/upload?tag=${jwt}`,
      jwt,
      async () => {
        invoked++;
        return 201;
      },
      true,
    ),
    (error) => error?.message === "CREDENTIAL_IN_URL",
  );
  assert.equal(invoked, 0);
});
