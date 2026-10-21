import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Runs the real API handler with deterministic upstream fixtures. No external requests.
const original = {
  fetch: globalThis.fetch,
  info: console.info,
  ak: process.env.BAIDU_MAP_AK,
  env: process.env.VERCEL_ENV,
};
process.env.BAIDU_MAP_AK = "fixture-secret-ak";
process.env.VERCEL_ENV = "preview";
const { default: handler } = await import(pathToFileURL(resolve("api/venue-search.js")).href);
const ok = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const valid = {
  uid: "good-beijing", name: "国家网球中心", city: "北京市",
  address: "北京市朝阳区", location: { lat: 39.99, lng: 116.39 },
};
const foreign = {
  uid: "wrong-city", name: "上海网球场", city: "上海市",
  address: "上海市浦东新区", location: { lat: 31.23, lng: 121.47 },
};
const invalid = {
  uid: "bad-coordinate", name: "无效地点", city: "北京市",
  location: { lat: 91, lng: 116.39 },
};
const auth = { id: "11111111-1111-4111-8111-111111111111" };
const captured = [];
console.info = (...parts) => captured.push(parts.join(" "));

async function callFixture(upstream) {
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return ok(auth);
    return upstream(url);
  };
  const result = { status: 0, body: null };
  const response = {
    setHeader() {},
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; },
  };
  await handler({
    method: "GET",
    headers: { authorization: "Bearer private-test-token" },
    query: { query: "国家网球中心", region: "北京" },
  }, response);
  return result;
}

function stages() {
  return captured.map(line => {
    assert.ok(line.startsWith("VENUE_POI_STAGE "));
    return JSON.parse(line.slice("VENUE_POI_STAGE ".length));
  });
}

try {
  const good = await callFixture(url => url.includes("/v3/suggestion")
    ? ok({ status: 0, results: [valid, foreign, invalid] })
    : ok({ status: 0, results: [] }));
  assert.equal(good.status, 200);
  assert.deepEqual(good.body.results.map(item => item.uid), ["good-beijing"]);
  const success = stages();
  assert.equal(success.length, 2);
  assert.equal(success[0].raw_count, 3);
  assert.equal(success[0].valid_coordinate_count, 2);
  assert.equal(success[0].city_coordinate_count, 1);
  assert.equal(success[0].health, null);
  assert.equal(success[0].trace_id, success[1].trace_id);
  assert.notEqual(success[0].sequence, success[1].sequence);
  assert.ok(success.every(item => !Object.hasOwn(item, "query")));
  for (const sensitive of ["fixture-secret-ak", "private-test-token", "国家网球中心", "北京市朝阳区", "39.99", "116.39"]) {
    assert.ok(!captured.join("\n").includes(sensitive), `must not log ${sensitive}`);
  }

  captured.length = 0;
  const quota = await callFixture(() => ok({ status: 302, message: "quota" }));
  assert.equal(quota.status, 502);
  assert.equal(quota.body.error, "BAIDU_PLACE_UPSTREAM_ERROR");
  assert.ok(stages().length >= 2);
  assert.ok(stages().every(stage => stage.health === "business" && stage.raw_count === null));

  captured.length = 0;
  process.env.VERCEL_ENV = "production";
  const production = await callFixture(() => ok({ status: 0, results: [valid] }));
  assert.equal(production.status, 200);
  assert.equal(captured.length, 0, "production must not emit diagnostic logs");
  console.log("V8 preview-only POI stage observability contract passed");
} finally {
  globalThis.fetch = original.fetch;
  console.info = original.info;
  if (original.ak === undefined) delete process.env.BAIDU_MAP_AK;
  else process.env.BAIDU_MAP_AK = original.ak;
  if (original.env === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = original.env;
}
