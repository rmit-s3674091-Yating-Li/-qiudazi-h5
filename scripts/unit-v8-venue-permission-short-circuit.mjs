import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyBaiduTerminalStatus } from "../api/venue-search-terminal-status.js";
import { default as handler } from "../api/venue-search.js";
import ts from "typescript";

assert.equal(
  classifyBaiduTerminalStatus([240, 240]),
  "BAIDU_PLACE_PERMISSION_DENIED",
);
assert.equal(
  classifyBaiduTerminalStatus([0, 240]),
  "BAIDU_PLACE_PERMISSION_DENIED",
);
assert.equal(classifyBaiduTerminalStatus([302]), "BAIDU_PLACE_QUOTA_EXCEEDED");
assert.equal(
  classifyBaiduTerminalStatus([401]),
  "BAIDU_PLACE_CONCURRENCY_LIMIT",
);
assert.equal(
  classifyBaiduTerminalStatus([210]),
  "BAIDU_PLACE_APP_CONFIGURATION_ERROR",
);
assert.equal(classifyBaiduTerminalStatus([301]), "BAIDU_PLACE_QUOTA_EXCEEDED");
assert.equal(
  classifyBaiduTerminalStatus([402]),
  "BAIDU_PLACE_CONCURRENCY_LIMIT",
);
assert.equal(
  classifyBaiduTerminalStatus([260]),
  "BAIDU_PLACE_SERVICE_UNAVAILABLE",
);
assert.equal(
  classifyBaiduTerminalStatus([261]),
  "BAIDU_PLACE_SERVICE_UNAVAILABLE",
);
assert.equal(classifyBaiduTerminalStatus([0, 0]), null);

const originalFetch = globalThis.fetch;
const originalAk = process.env.BAIDU_MAP_AK;
const originalEnv = process.env.VERCEL_ENV;
const originalInfo = console.info;
process.env.BAIDU_MAP_AK = "fixture-only-never-a-real-ak";
process.env.VERCEL_ENV = "preview";
console.info = () => {};
// The fake response MUST reflect HTTP status. V5 silently ignored the second
// argument, so its supposed HTTP 401/403/429 cases actually ran as HTTP 200.
const ok = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
for (const code of [401, 403, 429]) {
  const denied = ok({ status: 0, results: [{ name: "fixture" }] }, code);
  assert.equal(denied.status, code);
  assert.equal(denied.ok, false, `HTTP ${code} must not be an ok response`);
}
assert.equal(ok({ status: 0 }).ok, true);
async function invoke(status, query = "奥森") {
  const endpoints = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user"))
      return ok({ id: "11111111-1111-4111-8111-111111111111" });
    endpoints.push(new URL(url).pathname);
    if (status === 0)
      return ok({
        status: 0,
        results: [
          {
            uid: "p1",
            name: "奥森网球中心",
            city: "北京市",
            location: { lat: 39.99, lng: 116.39 },
          },
        ],
      });
    return ok({ status, message: "fixture-only" });
  };
  let http = 0,
    body = null;
  const res = {
    setHeader() {},
    status(code) {
      http = code;
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
      headers: { authorization: "Bearer fixture-jwt" },
      query: { query, region: "北京" },
    },
    res,
  );
  return { http, body, endpoints };
}
try {
  for (const [status, http, error] of [
    [240, 502, "BAIDU_PLACE_PERMISSION_DENIED"],
    [302, 429, "BAIDU_PLACE_QUOTA_EXCEEDED"],
    [401, 429, "BAIDU_PLACE_CONCURRENCY_LIMIT"],
    [210, 502, "BAIDU_PLACE_APP_CONFIGURATION_ERROR"],
    [301, 429, "BAIDU_PLACE_QUOTA_EXCEEDED"],
    [402, 429, "BAIDU_PLACE_CONCURRENCY_LIMIT"],
    [260, 502, "BAIDU_PLACE_SERVICE_UNAVAILABLE"],
    [261, 502, "BAIDU_PLACE_SERVICE_UNAVAILABLE"],
  ]) {
    const result = await invoke(status);
    assert.equal(result.http, http);
    assert.equal(result.body.error, error);
    assert.deepEqual(result.body.upstream_statuses, [status]);
    assert.equal(
      result.endpoints.length,
      2,
      "one V3 pair only; no V2 or alias retry",
    );
    assert.ok(result.endpoints.every((p) => p.includes("/place/v3/")));
    assert.equal(result.body.search_diagnostics.endpoints.length, 2);
    assert.ok(!JSON.stringify(result.body).includes("fixture-jwt"));
  }
  // Independent upstream endpoints may have different service permissions.
  // A 240 from Suggestion must not erase a relevant, valid Region POI.
  async function invokeMixed(
    regionResults,
    query = "绿心公园",
    region = "北京",
  ) {
    const endpoints = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/auth/v1/user"))
        return ok({ id: "11111111-1111-4111-8111-111111111111" });
      endpoints.push(new URL(url).pathname);
      return url.includes("/v3/suggestion")
        ? ok({ status: 240, message: "fixture-only" })
        : ok({ status: 0, results: regionResults });
    };
    let http = 0,
      body = null;
    const res = {
      setHeader() {},
      status(code) {
        http = code;
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
        headers: { authorization: "Bearer fixture-jwt" },
        query: { query, region },
      },
      res,
    );
    return { http, body, endpoints };
  }
  const greenPoi = {
    uid: "green-1",
    name: "北京城市绿心森林公园",
    city: "北京市",
    location: { lat: 39.87, lng: 116.73 },
    address: "北京市通州区",
  };
  const mixedRelevant = await invokeMixed([greenPoi]);
  assert.equal(
    mixedRelevant.http,
    200,
    "valid Region candidate survives denied Suggestion",
  );
  assert.equal(mixedRelevant.body.results[0].uid, "green-1");
  assert.equal(
    mixedRelevant.body.partial_upstream_error,
    "BAIDU_PLACE_PERMISSION_DENIED",
  );
  assert.deepEqual(mixedRelevant.body.upstream_statuses, [240]);
  assert.equal(
    mixedRelevant.endpoints.length,
    2,
    "no extra calls on partial terminal response",
  );
  assert.ok(
    mixedRelevant.body.search_diagnostics.endpoints.some(
      (e) => e.status === 240,
    ),
  );
  // A successful provider response can contain one valid POI and one malformed
  // sibling. Do not discard the valid candidate merely because health=malformed.
  const mixedQuality = await invokeMixed([
    greenPoi,
    { uid: "bad-1", city: "北京市", location: { lat: 39.88, lng: 116.74 } },
  ]);
  assert.equal(
    mixedQuality.http,
    200,
    "valid POI survives malformed sibling on successful endpoint",
  );
  assert.deepEqual(
    mixedQuality.body.results.map((x) => x.uid),
    ["green-1"],
  );
  assert.equal(
    mixedQuality.body.partial_upstream_error,
    "BAIDU_PLACE_PERMISSION_DENIED",
  );

  // Exact names may contain inserted qualifiers; they are not substring matches.
  // These are fixed-regression names, but the matching algorithm is generic.
  const qizhong = await invokeMixed(
    [
      {
        uid: "sh-1",
        name: "上海旗忠森林体育城网球中心",
        city: "上海市",
        location: { lat: 31.02, lng: 121.21 },
      },
    ],
    "旗忠网球中心",
    "上海",
  );
  assert.equal(
    qizhong.http,
    200,
    "a relevant longer official name must survive mixed 240/0",
  );
  assert.equal(qizhong.body.results[0].uid, "sh-1");
  assert.equal(qizhong.endpoints.length, 2);
  const sichuan = await invokeMixed(
    [
      {
        uid: "cd-1",
        name: "四川川投国际网球中心",
        city: "成都市",
        location: { lat: 30.58, lng: 103.98 },
      },
    ],
    "四川国际网球中心",
    "成都",
  );
  assert.equal(
    sichuan.http,
    200,
    "infix brand name must not erase an otherwise valid POI",
  );
  assert.equal(sichuan.endpoints.length, 2);
  const mixedIrrelevant = await invokeMixed([
    { ...greenPoi, uid: "unrelated", name: "北京其他体育中心" },
  ]);
  assert.equal(
    mixedIrrelevant.http,
    502,
    "unrelated result is not a successful POI recall",
  );
  assert.equal(mixedIrrelevant.body.error, "BAIDU_PLACE_PERMISSION_DENIED");
  assert.equal(mixedIrrelevant.endpoints.length, 2);
  const mixedEmpty = await invokeMixed([]);
  assert.equal(
    mixedEmpty.http,
    502,
    "empty Region and denied Suggestion is an upstream error",
  );
  assert.equal(mixedEmpty.endpoints.length, 2);
  // HTTP-level 401/403/429 are distinct from a JSON business status.
  // An HTTP-denied body that deceptively contains status:0 must never supply a POI.
  async function invokeHttp(httpCode, mixed = false, deniedBody = null) {
    const endpoints = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/auth/v1/user"))
        return ok({ id: "11111111-1111-4111-8111-111111111111" });
      endpoints.push(new URL(url).pathname);
      if (mixed && url.includes("/v3/region"))
        return ok({ status: 0, results: [greenPoi] });
      return ok(deniedBody ?? { message: "fixture HTTP denial" }, httpCode);
    };
    let http = 0,
      body = null;
    const res = {
      setHeader() {},
      status(code) {
        http = code;
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
        headers: { authorization: "Bearer fixture-jwt" },
        query: { query: "绿心公园", region: "北京" },
      },
      res,
    );
    return { http, body, endpoints };
  }
  for (const [upstream, expectedHttp, expectedError] of [
    [401, 502, "BAIDU_PLACE_HTTP_AUTH_ERROR"],
    [403, 502, "BAIDU_PLACE_HTTP_AUTH_ERROR"],
    [429, 429, "BAIDU_PLACE_HTTP_RATE_LIMIT"],
  ]) {
    const denied = await invokeHttp(upstream);
    assert.equal(denied.http, expectedHttp);
    assert.equal(denied.body.error, expectedError);
    assert.equal(
      denied.endpoints.length,
      2,
      "HTTP terminal must not trigger V2/aliases",
    );
    assert.ok(
      denied.body.search_diagnostics.endpoints.every(
        (e) => e.http_status === upstream,
      ),
    );
  }
  const deceptive = await invokeHttp(403, false, {
    status: 0,
    results: [greenPoi],
  });
  assert.equal(
    deceptive.http,
    502,
    "HTTP 403 status:0 must not be accepted as a valid POI",
  );
  assert.equal(deceptive.body.error, "BAIDU_PLACE_HTTP_AUTH_ERROR");
  const httpMixed = await invokeHttp(403, true);
  assert.equal(
    httpMixed.http,
    200,
    "HTTP-denied Suggestion must not erase a valid Region POI",
  );
  assert.equal(httpMixed.body.results[0].uid, "green-1");
  assert.equal(
    httpMixed.body.partial_upstream_error,
    "BAIDU_PLACE_HTTP_AUTH_ERROR",
  );
  assert.equal(httpMixed.endpoints.length, 2);
  assert.ok(
    httpMixed.body.search_diagnostics.endpoints.some(
      (e) => e.http_status === 403,
    ),
  );
  const success = await invoke(0);
  assert.equal(success.http, 200);
  assert.equal(success.body.results[0].name, "奥森网球中心");

  const domain = await readFile(
    new URL("../src/domain/VenueSearchResolution.ts", import.meta.url),
    "utf8",
  );
  const js = ts.transpileModule(domain, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const { collectVenueSearch } = await import(
    `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
  );
  let attempts = 0;
  const terminal = await collectVenueSearch(
    ["奥森", "奥林匹克森林公园"],
    async () => {
      attempts++;
      throw new Error("BAIDU_PLACE_PERMISSION_DENIED");
    },
  );
  assert.equal(
    attempts,
    1,
    "client must not retry aliases after terminal permission failure",
  );
  assert.equal(terminal.hadFailure, true);
  assert.deepEqual(terminal.groups, []);
  let fallbackCalls = 0;
  const transient = await collectVenueSearch(
    ["奥森", "奥林匹克森林公园"],
    async () => {
      fallbackCalls++;
      if (fallbackCalls === 1) throw new Error("BAIDU_PLACE_NETWORK_ERROR");
      return ["valid-second-variant"];
    },
  );
  assert.equal(
    fallbackCalls,
    2,
    "transient error should not disable ordinary variant fallback",
  );
  assert.deepEqual(transient.groups, [["valid-second-variant"]]);
  console.log(
    "PASS: Baidu 240/permission/quota short circuit, normal success, client retry contract",
  );
} finally {
  globalThis.fetch = originalFetch;
  console.info = originalInfo;
  if (originalAk === undefined) delete process.env.BAIDU_MAP_AK;
  else process.env.BAIDU_MAP_AK = originalAk;
  if (originalEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalEnv;
}
