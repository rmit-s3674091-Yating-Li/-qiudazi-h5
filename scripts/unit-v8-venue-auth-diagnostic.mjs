import assert from "node:assert/strict";
import {
  DIAGNOSTIC_COMMIT,
  DIAGNOSTIC_EXPIRES,
  DIAGNOSTIC_MODE,
  DIAGNOSTIC_USER,
} from "../api/venue-auth-diagnostic.js";
const saved = { ...process.env };
const realFetch = globalThis.fetch;
const realNow = Date.now;
let sequence = 0;
const fixtureKey = "fixture-only-secret-not-real";
const request = () => ({
  method: "GET",
  headers: {
    authorization: "Bearer fixture-token",
    "x-venue-diagnostic": DIAGNOSTIC_MODE,
  },
  query: { diagnostic: DIAGNOSTIC_MODE },
});
function response() {
  return {
    code: 0,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
async function fresh() {
  return (await import(`../api/venue-auth-diagnostic.js?test=${sequence++}`))
    .runVenueAuthDiagnostic;
}
function enabled() {
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_GIT_COMMIT_REF = "feature/v8-confirmed-20261011";
  process.env.VERCEL_GIT_COMMIT_MESSAGE = DIAGNOSTIC_COMMIT;
  process.env.BAIDU_MAP_AK = ` ${fixtureKey} `;
  Date.now = () => DIAGNOSTIC_EXPIRES - 1000;
}
try {
  enabled();
  globalThis.fetch = async () => {
    throw new Error("NO_NETWORK_ALLOWED_IN_GATE_TEST");
  };
  for (const [key, denied] of [
    ["VERCEL_ENV", "production"],
    ["VERCEL_GIT_COMMIT_REF", "main"],
    ["VERCEL_GIT_COMMIT_MESSAGE", "ordinary commit"],
  ]) {
    enabled();
    process.env[key] = denied;
    const res = response();
    await (
      await fresh()
    )(request(), res, DIAGNOSTIC_USER);
    assert.equal(res.code, 404);
  }
  enabled();
  Date.now = () => DIAGNOSTIC_EXPIRES;
  let res = response();
  await (
    await fresh()
  )(request(), res, DIAGNOSTIC_USER);
  assert.equal(res.code, 404);
  enabled();
  res = response();
  await (
    await fresh()
  )(request(), res, "11111111-1111-4111-8111-111111111111");
  assert.equal(res.code, 403);
  for (const mutate of [
    (r) => delete r.headers["x-venue-diagnostic"],
    (r) => (r.query.query = "custom"),
    (r) => (r.query.diagnostic = [DIAGNOSTIC_MODE]),
  ]) {
    const req = request();
    mutate(req);
    res = response();
    await (
      await fresh()
    )(req, res, DIAGNOSTIC_USER);
    assert.equal(res.code, 400);
  }
  const handler = (await import("../api/venue-search.js")).default;
  const noAuth = request();
  delete noAuth.headers.authorization;
  res = response();
  await handler(noAuth, res);
  assert.equal(res.code, 401);
  assert.equal(res.headers["Cache-Control"], "no-store");
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "invalid token" }), { status: 401 });
  res = response();
  await handler(request(), res);
  assert.equal(res.code, 401);
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    calls.push(url);
    assert.equal(url.origin, "https://api.map.baidu.com");
    assert.equal(url.searchParams.get("ak"), fixtureKey);
    assert.equal(url.searchParams.get("region"), "北京");
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    return new Response(
      JSON.stringify({
        status: url.pathname.includes("/v3/") ? 200 : 0,
        message: `${fixtureKey} https://example.invalid/?secret=${fixtureKey}`,
        results: [
          { name: "奥林匹克森林公园", location: { lat: 40, lng: 116.4 } },
        ],
      }),
    );
  };
  const diagnose = await fresh();
  res = response();
  await diagnose(request(), res, DIAGNOSTIC_USER);
  assert.equal(res.code, 200);
  assert.equal(calls.length, 8);
  assert.equal(new Set(calls.map((u) => u.pathname)).size, 4);
  assert.equal(new Set(calls.map((u) => u.searchParams.get("query"))).size, 2);
  assert.equal(
    res.body.rows.filter((r) => r.business_status === 200).length,
    4,
  );
  assert.equal(
    res.body.rows.filter((r) => r.valid_candidate_count === 1).length,
    4,
  );
  assert.ok(!JSON.stringify(res.body).includes(fixtureKey));
  assert.ok(!JSON.stringify(res.body).includes("https://"));
  res = response();
  await diagnose(request(), res, DIAGNOSTIC_USER);
  assert.equal(res.code, 429);
  assert.equal(calls.length, 8);
  globalThis.fetch = async () => new Response("x".repeat(65537));
  res = response();
  await (
    await fresh()
  )(request(), res, DIAGNOSTIC_USER);
  assert.ok(
    res.body.rows.every((r) => r.classification === "RESPONSE_TOO_LARGE"),
  );
  console.log(
    "PASS temporary diagnostic: auth, Preview/ref/commit/user/expiry gates, fixed eight real-request slots, no V3 short circuit, bounds, redaction and per-instance quota",
  );
} finally {
  globalThis.fetch = realFetch;
  Date.now = realNow;
  for (const key of Object.keys(process.env))
    if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
}
