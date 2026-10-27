import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

process.env.BAIDU_MAP_AK = "fixture-secret-ak";
const moduleUrl = pathToFileURL(resolve("api/venue-search.js")).href;
const { default: handler } = await import(moduleUrl);
const ok = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const validEmpty = { status: 0, results: [] };

async function run(
  label,
  mapResponse,
  { authOk = true, authStatus = authOk ? 200 : 401, query = "网球中心" } = {},
) {
  let mapCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user"))
      return ok({ id: "11111111-1111-4111-8111-111111111111" }, authStatus);
    assert.equal(
      new URL(url).searchParams.get("ret_coordtype"),
      "gcj02ll",
      "all Baidu POI endpoints must return GCJ-02",
    );
    mapCalls++;
    return mapResponse(url, mapCalls);
  };
  let status = 0,
    body,
    headers = {};
  const res = {
    setHeader(key, value) {
      headers[key] = value;
    },
    status(value) {
      status = value;
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
      headers: { authorization: "Bearer test-token" },
      query: { query, region: "北京" },
    },
    res,
  );
  assert.equal(headers["Cache-Control"], "no-store", label);
  assert.ok(status, label);
  assert.ok(!JSON.stringify(body).includes("fixture-secret-ak"), label);
  return { status, body, mapCalls };
}

function assertFullFanout(result, label) {
  assert.ok(
    Array.isArray(result.body.query_variants) &&
      result.body.query_variants.length >= 1 &&
      result.body.query_variants.length <= 5,
    `${label}: bounded query variants`,
  );
  assert.equal(
    result.mapCalls,
    result.body.query_variants.length * 4,
    `${label}: V3 suggestion/region and V2 suggestion/search per variant`,
  );
}
const empty = await run("real empty", () => ok(validEmpty));
assert.equal(empty.status, 200);
assert.deepEqual(empty.body.results, []);
assertFullFanout(empty, "real empty");
const malformed = await run("malformed 200", () =>
  ok({ message: "broken schema" }),
);
assert.equal(malformed.status, 502);
assert.equal(malformed.body.error, "BAIDU_PLACE_INVALID_RESPONSE");
const badJson = await run("HTTP 200 invalid JSON", () => ({
  ok: true,
  json: async () => {
    throw new Error("invalid JSON");
  },
}));
assert.equal(badJson.status, 502);
assert.equal(badJson.body.error, "BAIDU_PLACE_INVALID_RESPONSE");
const malformedResults = await run("status zero missing results", () =>
  ok({ status: 0 }),
);
assert.equal(malformedResults.status, 502);
assert.equal(malformedResults.body.error, "BAIDU_PLACE_INVALID_RESPONSE");
const malformedItems = await run("status zero with malformed POI entries", () =>
  ok({
    status: 0,
    results: [
      null,
      42,
      { uid: "nameless", location: { lat: 39.99, lng: 116.39 } },
    ],
  }),
);
assert.equal(malformedItems.status, 502);
assert.equal(malformedItems.body.error, "BAIDU_PLACE_INVALID_RESPONSE");
const quota = await run("business 302", () =>
  ok({ status: 302, message: "quota" }),
);
assert.equal(quota.status, 429);
assert.equal(quota.body.error, "BAIDU_PLACE_QUOTA_EXCEEDED");
assert.deepEqual(quota.body.upstream_statuses, [302]);
const partialHttp = await run("mixed success and HTTP failure", (_, i) =>
  i % 2 ? ok(validEmpty) : ok({ message: "gateway" }, 503),
);
assert.equal(partialHttp.status, 502);
assert.equal(partialHttp.body.error, "BAIDU_PLACE_HTTP_ERROR");
const mixedBusiness = await run("mixed empty and business failure", (_, i) =>
  i % 2 ? ok(validEmpty) : ok({ status: 210, message: "bad parameter" }),
);
assert.equal(mixedBusiness.status, 502);
assert.deepEqual(mixedBusiness.body.upstream_statuses, [210]);
const poi = {
  uid: "venue-1",
  name: "国家网球中心",
  address: "北京市朝阳区",
  city: "北京市",
  location: { lat: 39.99, lng: 116.39 },
};
const success = await run("valid candidate", (_, i) =>
  i === 1 ? ok({ status: 0, results: [poi] }) : ok({ status: 0, results: [] }),
);
assert.equal(success.status, 200);
assert.equal(
  success.body.partial_upstream_error,
  undefined,
  "healthy upstream must remain fully successful",
);
assert.equal(success.body.results.length, 1);
assert.equal(success.body.results[0].uid, "venue-1");
assertFullFanout(success, "partial V3 name must continue to V2");
const mixedItems = await run("valid POI survives malformed sibling", (_, i) =>
  i === 1 ? ok({ status: 0, results: [null, poi] }) : ok(validEmpty),
);
assert.equal(mixedItems.status, 200);
assert.deepEqual(
  mixedItems.body.results.map((item) => item.uid),
  ["venue-1"],
);
assert.equal(
  mixedItems.body.partial_upstream_error,
  "BAIDU_PLACE_INVALID_RESPONSE",
);
const outsideCity = {
  ...poi,
  uid: "shanghai-venue",
  city: "上海市",
  address: "上海市浦东新区",
};
const outsideCityFallback = await run(
  "V3 off-city results must not suppress V2",
  (_, i) =>
    i === 1
      ? ok({ status: 0, results: [outsideCity] })
      : i === 3
        ? ok({ status: 0, results: [poi] })
        : ok(validEmpty),
);
assert.equal(outsideCityFallback.status, 200);
assertFullFanout(outsideCityFallback, "off-city V3 fallback");
assert.deepEqual(
  outsideCityFallback.body.results.map((item) => item.uid),
  ["venue-1"],
);
const invalidV3Fallback = await run(
  "V3 invalid coordinates must not suppress V2",
  (_, i) =>
    i === 1
      ? ok({
          status: 0,
          results: [
            { ...poi, uid: "bad-v3", location: { lat: 91, lng: 116.39 } },
          ],
        })
      : i === 3
        ? ok({ status: 0, results: [poi] })
        : ok(validEmpty),
);
assert.equal(invalidV3Fallback.status, 200);
assertFullFanout(invalidV3Fallback, "invalid-coordinate V3 fallback");
assert.deepEqual(
  invalidV3Fallback.body.results.map((item) => item.uid),
  ["venue-1"],
);
const zeroV3Fallback = await run(
  "V3 zero-island pin must not suppress V2",
  (_, i) =>
    i === 1
      ? ok({
          status: 0,
          results: [{ ...poi, uid: "zero-pin", location: { lat: 0, lng: 0 } }],
        })
      : i === 3
        ? ok({ status: 0, results: [poi] })
        : ok(validEmpty),
);
assert.equal(zeroV3Fallback.status, 200);
assertFullFanout(zeroV3Fallback, "zero-pin V3 fallback");
assert.deepEqual(
  zeroV3Fallback.body.results.map((item) => item.uid),
  ["venue-1"],
);

for (const [label, location] of [
  ["latitude outside range", { lat: 91, lng: 116.39 }],
  ["longitude outside range", { lat: 39.99, lng: 181 }],
  ["zero island is not a Chinese POI", { lat: 0, lng: 0 }],
  ["overseas pin with forged city", { lat: 51.5, lng: -0.12 }],
  ["missing latitude", { lng: 116.39 }],
  ["null latitude", { lat: null, lng: 116.39 }],
  ["blank latitude", { lat: " ", lng: 116.39 }],
  ["non-numeric latitude", { lat: "invalid", lng: 116.39 }],
  ["non-finite longitude", { lat: 39.99, lng: "Infinity" }],
  ["boolean latitude", { lat: false, lng: 116.39 }],
]) {
  const invalid = await run(label, (_, i) =>
    i === 1
      ? ok({ status: 0, results: [{ ...poi, location }] })
      : ok(validEmpty),
  );
  assert.equal(invalid.status, 502, label);
  assert.equal(invalid.body.error, "BAIDU_PLACE_INVALID_RESPONSE", label);
}
const mixedCoordinates = await run("drop bad candidate, keep valid", (_, i) =>
  i === 1
    ? ok({
        status: 0,
        results: [{ ...poi, uid: "bad", location: { lat: 91, lng: 116 } }, poi],
      })
    : ok(validEmpty),
);
assert.deepEqual(
  mixedCoordinates.body.results.map((item) => item.uid),
  ["venue-1"],
);
assert.equal(
  mixedCoordinates.body.partial_upstream_error,
  "BAIDU_PLACE_INVALID_RESPONSE",
);
const stringCoordinates = await run(
  "numeric string coordinates are valid",
  (_, i) =>
    i === 1
      ? ok({
          status: 0,
          results: [{ ...poi, location: { lat: "39.99", lng: "116.39" } }],
        })
      : ok(validEmpty),
);
assert.equal(stringCoordinates.status, 200);
const invalidChild = await run("reject malformed child coordinate", (_, i) =>
  i === 1
    ? ok({
        status: 0,
        results: [
          {
            ...poi,
            children: [
              {
                uid: "child-invalid",
                name: "invalid court",
                location: { lat: 100, lng: 116.39 },
              },
              {
                uid: "child-valid",
                name: "court 1",
                location: { lat: 39.991, lng: 116.391 },
              },
            ],
          },
        ],
      })
    : ok(validEmpty),
);
assert.deepEqual(
  invalidChild.body.results.map((item) => item.uid),
  ["venue-1", "child-valid"],
);
const childWithoutPin = await run(
  "do not fabricate a child venue pin from its parent",
  (_, i) =>
    i === 1
      ? ok({
          status: 0,
          results: [
            {
              ...poi,
              children: [
                { uid: "child-no-pin", name: "Court 3" },
                {
                  uid: "child-own-pin",
                  name: "Court 4",
                  location: { lat: 39.991, lng: 116.391 },
                },
              ],
            },
          ],
        })
      : ok(validEmpty),
);
assert.deepEqual(
  childWithoutPin.body.results.map((item) => item.uid),
  ["venue-1", "child-own-pin"],
);
const validChildOfInvalidParent = await run(
  "valid child survives invalid parent coordinates",
  (_, i) =>
    i === 1
      ? ok({
          status: 0,
          results: [
            {
              ...poi,
              uid: "parent-invalid",
              location: { lat: null, lng: 116.39 },
              children: [
                {
                  uid: "court-valid",
                  name: "court A",
                  location: { lat: 39.991, lng: 116.391 },
                },
              ],
            },
          ],
        })
      : ok(validEmpty),
);
assert.equal(validChildOfInvalidParent.status, 200);
assert.deepEqual(
  validChildOfInvalidParent.body.results.map((item) => item.uid),
  ["court-valid"],
);
const duplicateParentChildren = await run(
  "collect unique children from duplicate parent across endpoints",
  (_, i) =>
    i === 1
      ? ok({
          status: 0,
          results: [
            {
              ...poi,
              children: [
                {
                  uid: "court-a",
                  name: "court A",
                  location: { lat: 39.991, lng: 116.391 },
                },
              ],
            },
          ],
        })
      : i === 2
        ? ok({
            status: 0,
            results: [
              {
                ...poi,
                children: [
                  {
                    uid: "court-b",
                    name: "court B",
                    location: { lat: 39.992, lng: 116.392 },
                  },
                ],
              },
            ],
          })
        : ok(validEmpty),
);
assert.deepEqual(
  duplicateParentChildren.body.results.map((item) => item.uid),
  ["venue-1", "court-a", "court-b"],
);
const foreignCityChild = await run("foreign child city is rejected", (_, i) =>
  i === 1
    ? ok({
        status: 0,
        results: [
          {
            ...poi,
            children: [
              {
                uid: "foreign-child",
                name: "Tianjin court",
                city: "天津市",
                province: "天津市",
                address: "天津市南开区",
                location: { lat: 39.13, lng: 117.18 },
              },
            ],
          },
        ],
      })
    : ok(validEmpty),
);
assert.deepEqual(
  foreignCityChild.body.results.map((item) => item.uid),
  ["venue-1"],
);
const contradictoryProvince = await run(
  "reject Beijing city with Shanghai province",
  (_, i) =>
    i === 1
      ? ok({
          status: 0,
          results: [
            {
              ...poi,
              uid: "contradictory-province",
              address: "体育公园",
              province: "上海市",
            },
            poi,
          ],
        })
      : ok(validEmpty),
);
assert.equal(contradictoryProvince.status, 200);
assert.deepEqual(
  contradictoryProvince.body.results.map((item) => item.uid),
  ["venue-1"],
);
const contradictoryChildProvince = await run(
  "reject child with conflicting municipality province",
  (_, i) =>
    i === 1
      ? ok({
          status: 0,
          results: [
            {
              ...poi,
              children: [
                {
                  uid: "contradictory-child",
                  name: "Court B",
                  city: "北京市",
                  province: "天津市",
                  address: "球馆内",
                  location: { lat: 39.991, lng: 116.391 },
                },
              ],
            },
          ],
        })
      : ok(validEmpty),
);
assert.equal(contradictoryChildProvince.status, 200);
assert.deepEqual(
  contradictoryChildProvince.body.results.map((item) => item.uid),
  ["venue-1"],
);
const validBeijingProvince = await run(
  "retain consistent municipality province",
  (_, i) =>
    i === 1
      ? ok({ status: 0, results: [{ ...poi, province: "北京市" }] })
      : ok(validEmpty),
);
assert.equal(validBeijingProvince.status, 200);
assert.deepEqual(
  validBeijingProvince.body.results.map((item) => item.uid),
  ["venue-1"],
);
// The upstream region label is not proof that its coordinates belong to that city.
// A Shanghai pin falsely labelled as Beijing must not become a Beijing venue.
const forgedBeijingPin = {
  ...poi,
  uid: "wrong-city-pin",
  province: "北京市",
  city: "北京市",
  address: "北京市朝阳区",
  location: { lat: 31.2304, lng: 121.4737 },
};
const forgedLocation = await run(
  "reject obvious cross-city coordinates despite forged city metadata",
  (_, i) =>
    i === 1
      ? ok({ status: 0, results: [forgedBeijingPin, poi] })
      : ok(validEmpty),
);
assert.equal(forgedLocation.status, 200);
assert.deepEqual(
  forgedLocation.body.results.map((item) => item.uid),
  ["venue-1"],
);
const suburbanBeijingPin = {
  ...poi,
  uid: "beijing-suburb",
  province: "北京市",
  city: "北京市",
  location: { lat: 40.8, lng: 117.1 },
};
const suburbanLocation = await run(
  "retain distant but plausible Beijing suburban venue",
  (_, i) =>
    i === 1 ? ok({ status: 0, results: [suburbanBeijingPin] }) : ok(validEmpty),
);
assert.equal(suburbanLocation.status, 200);
assert.deepEqual(
  suburbanLocation.body.results.map((item) => item.uid),
  ["beijing-suburb"],
);
const localChild = await run("local child retains own address", (_, i) =>
  i === 1
    ? ok({
        status: 0,
        results: [
          {
            ...poi,
            children: [
              {
                uid: "local-child",
                name: "Court A",
                city: "北京市",
                address: "北京市朝阳区安立路",
                location: { lat: 39.991, lng: 116.391 },
              },
            ],
          },
        ],
      })
    : ok(validEmpty),
);
assert.equal(localChild.body.results[1].address, "北京市朝阳区安立路");
const invalidParentAndChild = await run(
  "invalid parent and child fail visibly",
  (_, i) =>
    i === 1
      ? ok({
          status: 0,
          results: [
            {
              ...poi,
              uid: "parent-bad",
              location: { lat: null, lng: 116.39 },
              children: [
                {
                  uid: "court-bad",
                  name: "court A",
                  location: { lat: 91, lng: 116.391 },
                },
              ],
            },
          ],
        })
      : ok(validEmpty),
);
assert.equal(invalidParentAndChild.status, 502);
assert.equal(invalidParentAndChild.body.error, "BAIDU_PLACE_INVALID_RESPONSE");
const suggestionSingular = await run(
  "legacy suggestion result array",
  (_, i) =>
    i === 1 ? ok({ status: 0, result: [poi] }) : ok({ status: 0, results: [] }),
);
assert.equal(suggestionSingular.status, 200);
assert.equal(suggestionSingular.body.results.length, 1);
const fallbackSingular = await run("v2 fallback result array", (_, i) =>
  i === 3 ? ok({ status: 0, result: [poi] }) : ok(validEmpty),
);
assert.equal(fallbackSingular.status, 200);
assert.equal(fallbackSingular.body.results.length, 1);
const partialResults = await run(
  "candidate survives partial upstream failure",
  (_, i) =>
    i === 1 ? ok({ status: 0, results: [poi] }) : ok({ message: "broken" }),
);
assert.equal(partialResults.status, 200);
assert.equal(partialResults.body.results.length, 1);
assert.equal(
  partialResults.body.partial_upstream_error,
  "BAIDU_PLACE_INVALID_RESPONSE",
);
const v3Partial = await run("v3 suggestion outage, region candidate", (url) =>
  url.includes("/v3/suggestion")
    ? Promise.reject(new Error("offline"))
    : ok({ status: 0, results: [poi] }),
);
assert.equal(v3Partial.status, 200);
assert.equal(
  v3Partial.body.partial_upstream_error,
  "BAIDU_PLACE_NETWORK_ERROR",
);
assert.deepEqual(
  v3Partial.body.results.map((item) => item.uid),
  ["venue-1"],
);
assertFullFanout(v3Partial, "partial V3 failure");
const v2Partial = await run("v2 suggestion outage, search candidate", (url) =>
  url.includes("/v3/")
    ? ok(validEmpty)
    : url.includes("/v2/suggestion")
      ? Promise.reject(new Error("offline"))
      : ok({ status: 0, results: [poi] }),
);
assert.equal(v2Partial.status, 200);
assert.equal(
  v2Partial.body.partial_upstream_error,
  "BAIDU_PLACE_NETWORK_ERROR",
);
assert.deepEqual(
  v2Partial.body.results.map((item) => item.uid),
  ["venue-1"],
);
assertFullFanout(v2Partial, "partial V2 failure");
// Unknown non-terminal business status must not be hidden by a good sibling.
const mixedUnknownBusiness = await run(
  "one valid candidate and unknown business error",
  (_, i) =>
    i === 1
      ? ok({ status: 0, results: [poi] })
      : i === 2
        ? ok({ status: 299, message: "unrecognized upstream status" })
        : ok(validEmpty),
);
assert.equal(mixedUnknownBusiness.status, 200);
assert.equal(mixedUnknownBusiness.body.results.length, 1);
assert.equal(
  mixedUnknownBusiness.body.partial_upstream_error,
  "BAIDU_PLACE_UPSTREAM_ERROR",
);
assert.deepEqual(mixedUnknownBusiness.body.upstream_statuses, [299]);
const failedWithoutResults = await run(
  "partial outage is not a genuine empty result",
  (url) =>
    url.includes("/v3/suggestion")
      ? Promise.reject(new Error("offline"))
      : ok(validEmpty),
);
assert.equal(failedWithoutResults.status, 502);
assert.equal(failedWithoutResults.body.error, "BAIDU_PLACE_NETWORK_ERROR");
const offline = await run("network failure", () => {
  throw new Error("offline");
});
assert.equal(offline.status, 502);
assert.equal(offline.body.error, "BAIDU_PLACE_NETWORK_ERROR");
const denied = await run(
  "auth denied",
  () => {
    throw new Error("should not query POI");
  },
  { authOk: false },
);
assert.equal(denied.status, 401);
assert.equal(denied.mapCalls, 0);
// An upstream Auth outage or rate limit is not proof that the user's JWT expired.
// Do not call Baidu when the Auth check is inconclusive.
for (const [authStatus, expectedStatus, expectedError] of [
  [401, 401, "AUTH_REQUIRED"],
  [403, 401, "AUTH_REQUIRED"],
  [400, 503, "AUTH_CHECK_UNAVAILABLE"],
  [429, 503, "AUTH_CHECK_UNAVAILABLE"],
  [500, 503, "AUTH_CHECK_UNAVAILABLE"],
  [503, 503, "AUTH_CHECK_UNAVAILABLE"],
]) {
  const checked = await run(
    `auth status ${authStatus}`,
    () => {
      throw new Error("Baidu must not be called");
    },
    { authStatus },
  );
  assert.equal(checked.status, expectedStatus);
  assert.equal(checked.body.error, expectedError);
  assert.equal(checked.mapCalls, 0);
}
// Regression: a common name with a suffix must reach the canonical Baidu query.
const greenHeart = await run(
  "green heart park suffix and alias",
  (url) => {
    const term = new URL(url).searchParams.get("query");
    return ok({
      status: 0,
      results:
        term === "城市绿心森林公园"
          ? [
              {
                ...poi,
                uid: "green-heart",
                name: "北京城市绿心森林公园",
                city: "北京市",
              },
            ]
          : [],
    });
  },
  { query: "绿心公园" },
);
assert.equal(greenHeart.status, 200);
assert.ok(greenHeart.body.query_variants.includes("绿心"));
assert.ok(greenHeart.body.query_variants.includes("城市绿心森林公园"));
assert.deepEqual(
  greenHeart.body.results.map((item) => item.uid),
  ["green-heart"],
);

// The same rule must work for an unseen station without a bespoke alias.
const station = await run(
  "generic station suffix relaxation",
  () => ok(validEmpty),
  { query: "望京西站" },
);
assert.equal(station.status, 200);
assert.ok(station.body.query_variants.includes("望京西"));
assert.equal(station.body.results.length, 0);

// Do not turn a broad generic query into an unbounded two-character root.
const generic = await run("generic tennis centre stays bounded", () =>
  ok(validEmpty),
);
assert.deepEqual(generic.body.query_variants, ["网球中心", "北京网球中心"]);
assert.ok(generic.body.query_variants.length <= 5);
console.log("V8 venue search upstream response contract tests passed.");
