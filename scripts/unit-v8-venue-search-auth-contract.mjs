import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

process.env.BAIDU_MAP_AK = "fixture-secret-ak";
const { default: handler } = await import(
  pathToFileURL(resolve("api/venue-search.js")).href
);
const UUID = "11111111-1111-4111-8111-111111111111";
const ok = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

async function run(authResponse) {
  let baiduCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes("/auth/v1/user")) return authResponse;
    baiduCalls++;
    return ok({ status: 0, results: [] });
  };
  let status = 0,
    body;
  const res = {
    setHeader() {},
    status(code) {
      status = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer fixture-token" },
      query: { query: "网球中心", region: "北京" },
    },
    res,
  );
  return { status, body, baiduCalls };
}

const authorized = await run(ok({ id: UUID }));
assert.equal(authorized.status, 200);
assert.deepEqual(authorized.body.results, []);
assert.equal(authorized.baiduCalls, 4);

for (const response of [
  ok({}),
  ok({ id: "" }),
  ok({ id: "actor" }),
  ok({ id: null }),
  ok(null),
  ok([]),
  {
    ok: true,
    json: async () => {
      throw new SyntaxError("invalid JSON");
    },
  },
]) {
  const result = await run(response);
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: "AUTH_CHECK_UNAVAILABLE" });
  assert.equal(result.baiduCalls, 0);
}
const rejected = await run(ok({ error: "invalid token" }, 401));
assert.equal(rejected.status, 401);
assert.deepEqual(rejected.body, { error: "AUTH_REQUIRED" });
assert.equal(rejected.baiduCalls, 0);
console.log("V8 venue search auth response contract tests passed.");
