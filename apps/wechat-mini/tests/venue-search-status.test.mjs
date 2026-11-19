import test from "node:test";
import assert from "node:assert/strict";
import { OfflineVenuePort } from "../src/core/ports.ts";
import { classifyVenueSearch } from "../src/core/venue-search.ts";

const candidate = {
  id: "poi-001",
  name: "奥森网球中心",
  address: "北京市朝阳区",
};

test("offline PoC reports UNAVAILABLE rather than a false zero-results claim", async () => {
  assert.deepEqual(await new OfflineVenuePort().search("北京", "奥森"), {
    status: "UNAVAILABLE",
    reason: "OFFLINE_POC",
    candidates: [],
  });
});

test("successful empty provider response means NO_RESULTS", async () => {
  assert.deepEqual(
    await classifyVenueSearch("北京", "不存在的球场", async () => []),
    { status: "NO_RESULTS", candidates: [] },
  );
});

test("successful nonempty response preserves candidates", async () => {
  assert.deepEqual(
    await classifyVenueSearch("北京", "奥森", async () => [candidate]),
    { status: "RESULTS", candidates: [candidate] },
  );
});

test("upstream errors remain SERVICE_ERROR, never NO_RESULTS", async () => {
  assert.deepEqual(
    await classifyVenueSearch("北京", "奥森", async () => {
      throw new Error("network failed");
    }),
    { status: "SERVICE_ERROR", reason: "UPSTREAM_FAILURE", candidates: [] },
  );
});

test("invalid upstream payloads fail closed without partial candidates", async () => {
  for (const payload of [
    null,
    {},
    [candidate, { id: "x" }],
    Array(51).fill(candidate),
  ]) {
    assert.deepEqual(
      await classifyVenueSearch("北京", "奥森", async () => payload),
      { status: "SERVICE_ERROR", reason: "INVALID_RESPONSE", candidates: [] },
    );
  }
});

test("invalid city/query blocks provider invocation", async () => {
  let calls = 0;
  for (const [city, query] of [
    ["", "奥森"],
    ["北京", ""],
    ["北京", "x".repeat(121)],
  ]) {
    assert.deepEqual(
      await classifyVenueSearch(city, query, async () => {
        calls++;
        return [candidate];
      }),
      { status: "SERVICE_ERROR", reason: "INVALID_INPUT", candidates: [] },
    );
  }
  assert.equal(calls, 0);
});

test("throwing getters and revoked proxies cannot crash the venue adapter", async () => {
  const bad = { id: "poi-001", name: "奥森网球中心" };
  Object.defineProperty(bad, "address", {
    get() {
      throw new Error("getter");
    },
  });
  const proxy = Proxy.revocable([candidate], {});
  proxy.revoke();
  assert.deepEqual(
    await classifyVenueSearch("北京", "奥森", async () => [bad]),
    { status: "SERVICE_ERROR", reason: "INVALID_RESPONSE", candidates: [] },
  );
  // Promise resolution inspects a thenable proxy and fails before normalization.
  assert.deepEqual(
    await classifyVenueSearch("北京", "奥森", async () => proxy.proxy),
    { status: "SERVICE_ERROR", reason: "UPSTREAM_FAILURE", candidates: [] },
  );
});
