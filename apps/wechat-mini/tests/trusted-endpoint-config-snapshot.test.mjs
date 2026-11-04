import test from "node:test";
import assert from "node:assert/strict";
import {
  createTrustedEndpointPolicy,
  guardedNetworkCall,
} from "../src/core/trusted-endpoint.ts";

const host = "https://mini-fixture.example";
const other = "https://other-fixture.example";
const valid = () => ({
  credentialOrigins: [host],
  anonymousOrigins: [other],
});
const blocked = (config) =>
  assert.throws(
    () => createTrustedEndpointPolicy(config),
    /INVALID_TRUSTED_ORIGIN|MISSING_TRUSTED_ORIGINS/,
  );

test("ordinary and frozen own-data configuration preserves exact-origin behavior", () => {
  const p = createTrustedEndpointPolicy(
    Object.freeze({
      credentialOrigins: Object.freeze([host]),
      anonymousOrigins: Object.freeze([other]),
    }),
  );
  assert.doesNotThrow(() => p.assert(`${host}/rest/v1/events`, true));
  assert.doesNotThrow(() => p.assert(`${other}/search`, false));
  assert.throws(() => p.assert(`${other}/search`, true), /UNTRUSTED_ENDPOINT/);
});

test("credential origin getter is never executed", () => {
  let reads = 0;
  const config = {
    get credentialOrigins() {
      reads++;
      return [host];
    },
  };
  blocked(config);
  assert.equal(reads, 0);
});

test("anonymous origin getter is never executed", () => {
  let reads = 0;
  const config = {
    credentialOrigins: [host],
    get anonymousOrigins() {
      reads++;
      return [other];
    },
  };
  blocked(config);
  assert.equal(reads, 0);
});

test("inherited credential origins are not accepted", () => {
  blocked(Object.create({ credentialOrigins: [host] }));
});

test("extra credential-like config fields are rejected", () => {
  blocked({ credentialOrigins: [host], session_key: "never-copy" });
});

test("symbol config fields are rejected", () => {
  blocked({ credentialOrigins: [host], [Symbol("hidden")]: "secret" });
});

test("accessor array element is rejected without execution", () => {
  let reads = 0;
  const origins = [host];
  Object.defineProperty(origins, "0", {
    configurable: true,
    enumerable: true,
    get() {
      reads++;
      return host;
    },
  });
  blocked({ credentialOrigins: origins });
  assert.equal(reads, 0);
});

test("sparse credential origins do not silently skip a slot", () => {
  const origins = [host, other];
  delete origins[0];
  blocked({ credentialOrigins: origins });
});

test("inherited array element cannot fill a hole", () => {
  const origins = [host];
  Object.setPrototypeOf(
    origins,
    Object.create(Array.prototype, { 0: { value: host } }),
  );
  blocked({ credentialOrigins: origins });
});

test("array instance map override cannot redirect trusted credential origin", () => {
  const origins = [host];
  origins.map = () => [other];
  blocked({ credentialOrigins: origins });
});

test("nonenumerable extra array properties are rejected", () => {
  const origins = [host];
  Object.defineProperty(origins, "secret", {
    value: "hidden",
    enumerable: false,
  });
  blocked({ credentialOrigins: origins });
});

test("revoked proxy configuration fails closed", () => {
  const { proxy, revoke } = Proxy.revocable(valid(), {});
  revoke();
  blocked(proxy);
});

test("revoked proxy array fails closed", () => {
  const { proxy, revoke } = Proxy.revocable([host], {});
  revoke();
  blocked({ credentialOrigins: proxy });
});

test("configuration mutation after creation does not expand trust", () => {
  const config = valid();
  const p = createTrustedEndpointPolicy(config);
  config.credentialOrigins[0] = other;
  config.anonymousOrigins.push("https://later.example");
  assert.doesNotThrow(() => p.assert(`${host}/rest/v1/events`, true));
  assert.throws(
    () => p.assert(`${other}/rest/v1/events`, true),
    /UNTRUSTED_ENDPOINT/,
  );
  assert.throws(
    () => p.assert("https://later.example/search", false),
    /UNTRUSTED_ENDPOINT/,
  );
});

test("malicious configuration cannot authorize a bearer network call", async () => {
  const origins = [host];
  origins.map = () => [other];
  let invoked = 0;
  blocked({ credentialOrigins: origins });
  const p = createTrustedEndpointPolicy({ credentialOrigins: [host] });
  await assert.rejects(
    guardedNetworkCall(p, `${other}/rest/v1/events`, "mock-jwt", async () => {
      invoked++;
      return true;
    }),
    /UNTRUSTED_ENDPOINT/,
  );
  assert.equal(invoked, 0);
});
