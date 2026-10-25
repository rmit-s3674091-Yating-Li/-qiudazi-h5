import assert from "node:assert/strict";
import handler from "../api/venue-search.js";

const savedFetch = globalThis.fetch;
const savedAk = process.env.BAIDU_MAP_AK;
const savedEnv = process.env.VERCEL_ENV;
process.env.BAIDU_MAP_AK = "fixture-only-ak";
const valid = {
  uid: "beijing-poi",
  name: "国家网球中心",
  city: "北京市",
  address: "北京市朝阳区",
  location: { lat: 39.99, lng: 116.39 },
};
const foreign = {
  uid: "foreign-poi",
  name: "上海网球中心",
  city: "上海市",
  address: "上海市浦东新区",
  location: { lat: 31.23, lng: 121.47 },
};
const malformed = {
  uid: "invalid-poi",
  name: "无效地点",
  city: "北京市",
  location: { lat: 91, lng: 116.39 },
};
const ok = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

async function invoke({
  preview = true,
  optIn = true,
  authorized = true,
  upstream = () => ok({ status: 0, results: [valid, foreign, malformed] }),
} = {}) {
  process.env.VERCEL_ENV = preview ? "preview" : "production";
  let baiduCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user"))
      return authorized
        ? ok({ id: "11111111-1111-4111-8111-111111111111" })
        : ok({}, 401);
    baiduCalls++;
    return upstream(url);
  };
  const result = { status: 0, body: null, baiduCalls: 0 };
  const res = {
    setHeader() {},
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer fixture-jwt" },
      query: {
        query: "国家网球中心",
        region: "北京",
        ...(optIn ? { diagnostics: "1" } : {}),
      },
    },
    res,
  );
  result.baiduCalls = baiduCalls;
  return result;
}

try {
  const good = await invoke();
  assert.equal(good.status, 200);
  assert.deepEqual(
    good.body.results.map((item) => item.uid),
    ["beijing-poi"],
  );
  const diagnostic = good.body.search_diagnostics;
  assert.equal(diagnostic.version, 1);
  assert.equal(diagnostic.merged_count, 1);
  assert.equal(diagnostic.endpoints.length, 2);
  assert.ok(
    diagnostic.endpoints.every(
      (stage) =>
        stage.raw_count === 3 &&
        stage.valid_coordinate_count === 2 &&
        stage.city_retained_count === 1,
    ),
  );
  assert.equal(diagnostic.client_rank_status, "NOT_EXPOSED");
  for (const secret of [
    "fixture-only-ak",
    "fixture-jwt",
    "国家网球中心",
    "北京市朝阳区",
    "39.99",
    "116.39",
  ]) {
    assert.ok(
      !JSON.stringify(diagnostic).includes(secret),
      `diagnostic response must redact ${secret}`,
    );
  }

  const noOptIn = await invoke({ optIn: false });
  assert.equal(noOptIn.status, 200);
  assert.equal(
    Object.hasOwn(noOptIn.body, "search_diagnostics"),
    true,
    "Preview regression harness does not send a diagnostics flag",
  );

  const production = await invoke({ preview: false });
  assert.equal(production.status, 200);
  assert.equal(Object.hasOwn(production.body, "search_diagnostics"), false);

  const unauthorized = await invoke({ authorized: false });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.baiduCalls, 0);
  assert.equal(Object.hasOwn(unauthorized.body, "search_diagnostics"), false);

  const quota = await invoke({
    upstream: () => ok({ status: 302, message: "quota" }),
  });
  assert.equal(quota.status, 429);
  assert.equal(quota.body.error, "BAIDU_PLACE_QUOTA_EXCEEDED");
  assert.ok(quota.body.search_diagnostics.endpoints.length >= 2);
  assert.ok(
    quota.body.search_diagnostics.endpoints.every(
      (stage) => stage.status === 302 && stage.raw_count === null,
    ),
  );

  const httpError = await invoke({
    upstream: () => ok({ status: 0, results: [] }, 403),
  });
  assert.equal(httpError.status, 502);
  assert.equal(httpError.body.error, "BAIDU_PLACE_HTTP_AUTH_ERROR");
  assert.equal(
    httpError.body.search_diagnostics.endpoints.length,
    2,
    "HTTP auth denial stops before V2 retries",
  );
  assert.ok(
    httpError.body.search_diagnostics.endpoints.every(
      (stage) => stage.http_status === 403,
    ),
  );
  assert.ok(
    httpError.body.search_diagnostics.endpoints.every(
      (stage) => stage.health === "http",
    ),
  );
  console.log(
    "PASS V8 authenticated Preview-only POI stage response diagnostics",
  );
} finally {
  globalThis.fetch = savedFetch;
  if (savedAk === undefined) delete process.env.BAIDU_MAP_AK;
  else process.env.BAIDU_MAP_AK = savedAk;
  if (savedEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = savedEnv;
}
