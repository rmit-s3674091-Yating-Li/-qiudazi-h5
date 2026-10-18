import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const priorKey = process.env.BAIDU_MAP_AK;
const priorFetch = globalThis.fetch;
process.env.BAIDU_MAP_AK = "fixture-secret-ak";
const { default: handler } = await import(pathToFileURL(resolve("api/venue-reverse.js")).href);
const ok = (body, status = 200) => ({ ok: status >= 200 && status < 300, json: async () => body });
const valid = { status: 0, result: { formatted_address: "北京市朝阳区" } };

async function run({ location = "39.99,116.39", method = "GET", auth = "Bearer test-token", authUpstream = null, upstream = () => ok(valid) } = {}) {
  let mapCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return authUpstream ? authUpstream(url) : ok({ id: "actor" }, auth === "Bearer denied" ? 401 : 200);
    mapCalls++;
    assert.match(url, /coordtype=wgs84ll/);
    assert.match(url, /extensions_poi=1/);
    return upstream(url);
  };
  let status = 0;
  let body;
  const headers = {};
  const res = {
    setHeader(key, value) { headers[key] = value; },
    status(code) { status = code; return this; },
    json(value) { body = value; return this; },
  };
  await handler({ method, headers: { authorization: auth }, query: { location } }, res);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.ok(status);
  assert.ok(!JSON.stringify(body).includes("fixture-secret-ak"));
  return { status, body, mapCalls };
}

try {
  assert.deepEqual((await run()).body, valid);
  assert.equal((await run({ location: "91,116" })).status, 400);
  assert.equal((await run({ location: "39,181" })).status, 400);
  assert.equal((await run({ location: "39,abc" })).status, 400);
  assert.equal((await run({ method: "POST" })).status, 405);
  assert.equal((await run({ auth: "" })).status, 401);
  assert.equal((await run({ auth: "Bearer denied" })).status, 401);
  const authNetwork = await run({ authUpstream: () => { throw new Error("auth offline"); } });
  assert.equal(authNetwork.status, 503);
  assert.deepEqual(authNetwork.body, { error: "AUTH_CHECK_UNAVAILABLE" });
  assert.equal(authNetwork.mapCalls, 0);
  // Trigger the real 6500ms deadline without waiting; a hanging auth call is a timeout, not an outage.
  const nativeSetTimeout = globalThis.setTimeout;
  try {
    globalThis.setTimeout = (callback, delay, ...args) => {
      assert.equal(delay, 6500);
      return nativeSetTimeout(callback, 0, ...args);
    };
    const authTimeout = await run({ authUpstream: () => new Promise(() => {}) });
    assert.equal(authTimeout.status, 504);
    assert.deepEqual(authTimeout.body, { error: "VENUE_REVERSE_TIMEOUT" });
    assert.equal(authTimeout.mapCalls, 0);
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
  }
  const business = await run({ upstream: () => ok({ status: 302, message: "quota" }) });
  assert.equal(business.status, 502);
  assert.deepEqual(business.body, { error: "BAIDU_REVERSE_UPSTREAM_ERROR", upstream_status: 302 });
  const malformed = await run({ upstream: () => ok({ status: 0 }) });
  assert.equal(malformed.status, 502);
  assert.equal(malformed.body.error, "BAIDU_REVERSE_INVALID_RESPONSE");
  const missingStatus = await run({ upstream: () => ok({ result: valid.result }) });
  assert.equal(missingStatus.body.error, "BAIDU_REVERSE_INVALID_RESPONSE");
  const invalidJson = await run({ upstream: () => ({ ok: true, json: async () => { throw new SyntaxError("invalid JSON"); } }) });
  assert.equal(invalidJson.body.error, "BAIDU_REVERSE_INVALID_RESPONSE");
  const httpFailure = await run({ upstream: () => ok({ status: 0 }, 503) });
  assert.equal(httpFailure.body.error, "BAIDU_REVERSE_HTTP_ERROR");
  const networkFailure = await run({ upstream: () => { throw new Error("network"); } });
  assert.equal(networkFailure.body.error, "BAIDU_REVERSE_NETWORK_ERROR");
  console.log("PASS V8 Baidu reverse geocoding HTTP/business/schema and coordinate contracts");
} finally {
  globalThis.fetch = priorFetch;
  if (priorKey === undefined) delete process.env.BAIDU_MAP_AK;
  else process.env.BAIDU_MAP_AK = priorKey;
}
