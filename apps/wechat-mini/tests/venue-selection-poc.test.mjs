import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OfflineFixtureVenuePort,
  VenueSelectionPoc,
  POC_CITIES,
} from "../src/core/venue-selection-poc.ts";
import { OfflineVenuePort } from "../src/core/ports.ts";

const fixture = () => new VenueSelectionPoc(new OfflineFixtureVenuePort());
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("only three explicit mock cities are supported", () => {
  assert.deepEqual(POC_CITIES, ["北京", "上海", "成都"]);
  assert.throws(
    () => new VenueSelectionPoc(new OfflineFixtureVenuePort(), "杭州"),
    /INVALID_CITY/,
  );
  assert.equal(fixture().setCity("杭州"), false);
});

test("fixture search returns fictional candidates scoped to selected city", async () => {
  const p = fixture();
  assert.equal((await p.search("模拟")).status, "RESULTS");
  assert.equal(p.snapshot().candidates.length, 2);
  assert.ok(
    p.snapshot().candidates.every((x) => x.id.startsWith("fixture-bj")),
  );
  p.setCity("上海");
  await p.search("模拟");
  assert.deepEqual(
    p.snapshot().candidates.map((x) => x.id),
    ["fixture-sh-001"],
  );
  p.setCity("成都");
  await p.search("模拟");
  assert.deepEqual(
    p.snapshot().candidates.map((x) => x.id),
    ["fixture-cd-001"],
  );
});

test("no result differs from unavailable and service error", async () => {
  const p = fixture();
  assert.equal((await p.search("真实球场不存在于模拟池")).status, "NO_RESULTS");
  assert.equal(
    (await new VenueSelectionPoc(new OfflineVenuePort()).search("模拟")).status,
    "UNAVAILABLE",
  );
  assert.equal(
    (
      await new VenueSelectionPoc({
        search: async () => {
          throw new Error("network secret");
        },
      }).search("模拟")
    ).reason,
    "UPSTREAM_FAILURE",
  );
});

test("empty, control and too-long queries are rejected without calling port", async () => {
  let calls = 0;
  const p = new VenueSelectionPoc({
    search: async () => {
      calls++;
      return { status: "NO_RESULTS", candidates: [] };
    },
  });
  for (const value of ["", "  ", "a\n", "a".repeat(81), null]) {
    assert.equal((await p.search(value)).reason, "INVALID_INPUT");
  }
  assert.equal(calls, 0);
});

test("never auto-selects a search result", async () => {
  const p = fixture();
  await p.search("模拟");
  assert.equal(p.snapshot().selected, null);
  assert.equal(p.confirm(), null);
  assert.equal(p.chooseCandidate("fixture-sh-001"), false);
  assert.equal(p.chooseCandidate("fixture-bj-002"), true);
  assert.equal(p.snapshot().selected.id, "fixture-bj-002");
});

test("manual fallback works after a genuine no-result", async () => {
  const p = fixture();
  await p.search("没有匹配");
  assert.equal(p.useManual("手填场馆", "手填地址"), true);
  assert.deepEqual(p.confirm(), {
    city: "北京",
    name: "手填场馆",
    address: "手填地址",
    source: "manual",
    status: "DRAFT_ONLY",
  });
});

test("manual fallback works after unavailable service", async () => {
  const p = new VenueSelectionPoc(new OfflineVenuePort());
  await p.search("模拟");
  assert.equal(p.useManual("我的球馆", "手工输入的地址"), true);
  assert.equal(p.confirm().source, "manual");
});

test("invalid manual input never changes existing selection", async () => {
  const p = fixture();
  await p.search("模拟");
  p.chooseCandidate("fixture-bj-001");
  for (const [name, address] of [
    ["", "地址"],
    ["球馆", "\n"],
    ["a".repeat(81), "地址"],
    ["球馆", "a".repeat(161)],
  ])
    assert.equal(p.useManual(name, address), false);
  assert.equal(p.snapshot().selected.id, "fixture-bj-001");
});

test("confirmed draft is one-shot and never includes location coordinates or credentials", async () => {
  const p = fixture();
  await p.search("模拟");
  p.chooseCandidate("fixture-bj-001");
  const draft = p.confirm();
  assert.equal(draft.source, "mock_poi");
  assert.equal(p.confirm(), null);
  assert.deepEqual(Object.keys(draft).sort(), [
    "address",
    "city",
    "name",
    "source",
    "status",
  ]);
});

test("changing city clears prior selected candidate and confirmed draft", async () => {
  const p = fixture();
  await p.search("模拟");
  p.chooseCandidate("fixture-bj-001");
  p.confirm();
  p.setCity("成都");
  assert.equal(p.snapshot().status, "IDLE");
  assert.equal(p.snapshot().draft, null);
  assert.equal(p.snapshot().selected, null);
});

test("late response after city switch cannot reinsert old-city POI", async () => {
  const d = deferred();
  const p = new VenueSelectionPoc({ search: () => d.promise });
  const pending = p.search("模拟");
  p.setCity("上海");
  d.resolve({
    status: "RESULTS",
    candidates: [
      { id: "fixture-bj-001", name: "北京旧场馆", address: "模拟地址" },
    ],
  });
  await pending;
  assert.equal(p.snapshot().city, "上海");
  assert.equal(p.snapshot().status, "IDLE");
  assert.deepEqual(p.snapshot().candidates, []);
});

test("manual fallback invalidates an in-flight search", async () => {
  const d = deferred();
  const p = new VenueSelectionPoc({ search: () => d.promise });
  const pending = p.search("模拟");
  p.useManual("手填", "手填地址");
  d.resolve({ status: "NO_RESULTS", candidates: [] });
  await pending;
  assert.equal(p.snapshot().status, "MANUAL");
  assert.equal(p.snapshot().selected.name, "手填");
});

test("second query wins even if the first resolves last", async () => {
  const first = deferred(),
    second = deferred();
  let n = 0;
  const p = new VenueSelectionPoc({
    search: () => (++n === 1 ? first.promise : second.promise),
  });
  const a = p.search("第一次");
  const b = p.search("第二次");
  second.resolve({ status: "NO_RESULTS", candidates: [] });
  await b;
  first.resolve({
    status: "RESULTS",
    candidates: [{ id: "old", name: "旧场馆", address: "旧地址" }],
  });
  await a;
  assert.equal(p.snapshot().status, "NO_RESULTS");
  assert.deepEqual(p.snapshot().candidates, []);
});

test("invalid and duplicate candidate lists fail closed", async () => {
  for (const payload of [
    { status: "RESULTS", candidates: [] },
    {
      status: "RESULTS",
      candidates: [
        { id: "same", name: "A", address: "x" },
        { id: "same", name: "B", address: "y" },
      ],
    },
    {
      status: "NO_RESULTS",
      candidates: [{ id: "x", name: "A", address: "x" }],
    },
    { status: "RESULTS", candidates: [{ id: "x", name: "", address: "x" }] },
    { status: "UNKNOWN", candidates: [] },
    { status: "UNAVAILABLE", reason: "SUCCESS", candidates: [] },
    { status: "SERVICE_ERROR", reason: "NO_RESULTS", candidates: [] },
  ]) {
    const p = new VenueSelectionPoc({ search: async () => payload });
    assert.equal((await p.search("模拟")).reason, "INVALID_RESPONSE");
    assert.equal(p.confirm(), null);
  }
});

test("snapshots are detached from internal state", async () => {
  const p = fixture();
  await p.search("模拟");
  const s = p.snapshot();
  s.candidates[0].name = "恶意修改";
  s.candidates.length = 0;
  assert.equal(p.snapshot().candidates.length, 2);
  assert.notEqual(p.snapshot().candidates[0].name, "恶意修改");
});

test("page registration and UI remain offline and do not claim a real venue", () => {
  const app = readFileSync(
    new URL("../src/app.config.ts", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL("../src/pages/venue-poc/index.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /pages\/venue-poc\/index/);
  assert.match(page, /DRAFT_ONLY/);
  assert.match(page, /OfflineVenuePort/);
  assert.doesNotMatch(
    page,
    /fetch\(|uploadFile\(|wx\.login\(|service_role|AppSecret/,
  );
});
