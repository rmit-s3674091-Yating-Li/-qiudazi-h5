import assert from "node:assert/strict";
import handler from "../api/venue-search-health.js";

const originalFetch = globalThis.fetch;
const originalPreview = process.env.VERCEL_ENV;
const originalAk = process.env.BAIDU_MAP_AK;
const secret = "private-preview-ak";
let requests = [];
const valid = { name: "北投网球运动中心", address: "北京市通州区", uid: "poi-1", location: { lat: 39.9, lng: 116.4 } };

async function invoke(method = "GET") {
  let status = 0;
  const headers = {};
  let body;
  const res = {
    setHeader: (key, value) => { headers[key] = value; },
    status: (code) => { status = code; return res; },
    json: (payload) => { body = payload; return res; },
  };
  await handler({ method }, res);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.ok(!JSON.stringify(body).includes(secret), "never leak the map AK");
  return { status, body };
}
function upstream(payload, ok = true) {
  globalThis.fetch = async (url) => { requests.push(url); return { ok, json: async () => payload }; };
}

try {
  process.env.VERCEL_ENV = "production";
  process.env.BAIDU_MAP_AK = secret;
  assert.deepEqual(await invoke(), { status: 404, body: { error: "NOT_FOUND" } });
  process.env.VERCEL_ENV = "preview";
  assert.deepEqual(await invoke("POST"), { status: 405, body: { error: "METHOD_NOT_ALLOWED" } });
  delete process.env.BAIDU_MAP_AK;
  assert.deepEqual(await invoke(), { status: 200, body: { configured: false, upstream_ok: false, error: "BAIDU_MAP_AK_MISSING" } });
  process.env.BAIDU_MAP_AK = secret;
  upstream({ status: 0, results: [valid, { ...valid, location: { lat: null, lng: "" } }] });
  let response = await invoke();
  assert.equal(response.status, 200);
  assert.equal(response.body.upstream_ok, true);
  assert.equal(response.body.result_count, 1);
  assert.deepEqual(response.body.results[0].location, { lat: 39.9, lng: 116.4 });
  assert.equal(response.body.error, undefined);
  assert.ok(requests[0].includes("region=%E5%8C%97%E4%BA%AC"));
  upstream({ status: 0, results: [
    { ...valid, location: { lat: null, lng: 0 } },
    { ...valid, location: { lat: 91, lng: 0 } },
    { ...valid, location: { lat: "", lng: 0 } },
    valid,
  ] });
  assert.equal((await invoke()).body.result_count, 1, "later valid POI must not be hidden by invalid leading entries");
  upstream({ status: 0, results: [] });
  response = await invoke();
  assert.equal(response.body.upstream_ok, true, "valid empty result is not an upstream error");
  assert.equal(response.body.result_count, 0);
  upstream({ status: 302, message: "invalid key", results: [] });
  response = await invoke();
  assert.equal(response.body.upstream_ok, false);
  assert.equal(response.body.error, "BAIDU_PLACE_UPSTREAM_ERROR");
  assert.equal(response.body.upstream_status, 302);
  upstream({ status: 0, results: [valid] }, false);
  response = await invoke();
  assert.equal(response.body.http_ok, false);
  assert.equal(response.body.error, "BAIDU_PLACE_HTTP_ERROR");
  upstream({ status: 0, results: { bad: true } });
  assert.equal((await invoke()).body.error, "BAIDU_PLACE_INVALID_RESPONSE");
  upstream({ status: 0, results: [{ ...valid, location: { lat: 91, lng: 116.4 } }] });
  assert.equal((await invoke()).body.error, "BAIDU_PLACE_INVALID_RESPONSE");
  upstream({ status: 0, results: [{ ...valid, location: { lat: "", lng: 116.4 } }] });
  assert.equal((await invoke()).body.error, "BAIDU_PLACE_INVALID_RESPONSE");
  upstream({ status: 0, results: [{ ...valid, location: { lat: "39.9", lng: "116.4" } }] });
  assert.equal((await invoke()).body.upstream_ok, true);
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error("bad JSON"); } });
  assert.equal((await invoke()).body.error, "BAIDU_PLACE_INVALID_RESPONSE");
  globalThis.fetch = async () => { throw new Error("network"); };
  assert.deepEqual(await invoke(), { status: 200, body: { configured: true, upstream_ok: false, error: "BAIDU_PLACE_NETWORK_ERROR" } });
  console.log("PASS V8 preview venue-search-health provider diagnostic contract (12 cases)");
} finally {
  globalThis.fetch = originalFetch;
  if (originalPreview === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalPreview;
  if (originalAk === undefined) delete process.env.BAIDU_MAP_AK;
  else process.env.BAIDU_MAP_AK = originalAk;
}
