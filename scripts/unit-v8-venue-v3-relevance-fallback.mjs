import assert from "node:assert/strict";
import { hasDirectNameMatch } from "../api/venue-search-relevance.js";

const p = name => ({ name, city: "北京市", location: { lat: 39.9, lng: 116.4 } });
assert.equal(hasDirectNameMatch("奥森", [p("奥森网球中心")]), true);
assert.equal(hasDirectNameMatch("奥森", [p("奥运森林活动中心")]), false);
assert.equal(hasDirectNameMatch("奥森", [p("奥林匹克森林公园")]), false,
  "a canonical synonym is retained, but must not suppress fallback without literal evidence");
assert.equal(hasDirectNameMatch("绿心公园", [p("普通绿地"), p("北京城市绿心森林公园")]), false);
assert.equal(hasDirectNameMatch("国家网球中心", [p("国家网球中心")]), true);
assert.equal(hasDirectNameMatch("国家网球中心", [p("国家体育中心")]), false);
assert.equal(hasDirectNameMatch("  国家 网球中心 ", [p("国家网球中心")]), true);
assert.equal(hasDirectNameMatch("国家网球中心", [null, { name: 12 }, {}]), false);
assert.equal(hasDirectNameMatch("", [p("国家网球中心")]), false);

// Exercise the actual handler with mocked Baidu V3/V2 and Supabase auth.
process.env.BAIDU_MAP_AK = "fixture-only-not-a-real-key";
const { default: handler } = await import("../api/venue-search.js");
const ok = body => ({ ok: true, status: 200, json: async () => body });
const empty = { status: 0, results: [] };
const unrelated = p("普通活动地点");
const exact = p("奥森网球中心");
let v2Calls = 0;
const originalFetch = globalThis.fetch;
async function run(v3, v2) {
  v2Calls = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return ok({ id: "11111111-1111-4111-8111-111111111111" });
    const path = new URL(url).pathname;
    if (path.includes("/v2/")) { v2Calls++; return ok(v2); }
    return ok(v3);
  };
  let status = 0, body;
  const res = { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  await handler({ method: "GET", headers: { authorization: "Bearer fixture" }, query: { query: "奥森", region: "北京" } }, res);
  return { status, body, v2Calls };
}
try {
  const recovered = await run({ status: 0, results: [unrelated] }, { status: 0, results: [exact] });
  assert.equal(recovered.status, 200);
  assert.ok(recovered.v2Calls > 0, "unrelated but valid V3 candidates must not suppress V2");
  assert.ok(recovered.body.results.some(item => item.name === exact.name), "V2 exact venue must be retained");
  const direct = await run({ status: 0, results: [exact] }, empty);
  assert.equal(direct.status, 200);
  assert.equal(direct.v2Calls, 0, "literal V3 name match does not need V2 for that variant");
  const trulyEmpty = await run(empty, empty);
  assert.equal(trulyEmpty.status, 200);
  assert.deepEqual(trulyEmpty.body.results, []);
  console.log("PASS V8 V3 irrelevant-candidate V2 fallback and literal short-circuit");
} finally {
  globalThis.fetch = originalFetch;
}
