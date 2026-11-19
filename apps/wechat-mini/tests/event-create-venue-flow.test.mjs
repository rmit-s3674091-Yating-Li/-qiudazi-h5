import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OfflineEventCreateVenueFlow } from "../src/core/event-create-venue-flow.ts";

const flow = () => new OfflineEventCreateVenueFlow();
const open = (f, city = "北京", now = 1000) => {
  assert.equal(f.changeCity(city), true);
  assert.equal(f.openPicker(now).status, "opened_mock_only");
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("requires an explicit city; no default Beijing", () => {
  const f = flow();
  assert.equal(f.snapshot().city, null);
  assert.deepEqual(f.openPicker(1000), {
    status: "blocked",
    reason: "CITY_REQUIRED",
  });
});

test("rejects unsupported cities and leaves the form unchanged", () => {
  const f = flow();
  assert.equal(f.changeCity("杭州"), false);
  assert.equal(f.snapshot().city, null);
});

test("opens a picker with the selected city only", () => {
  const f = flow();
  open(f, "上海");
  assert.equal(f.snapshot().picker.city, "上海");
  assert.equal(f.snapshot().step, "VENUE_PICKER");
});

test("candidate selection is explicit, never auto-first", async () => {
  const f = flow();
  open(f);
  await f.search("模拟");
  assert.equal(f.snapshot().picker.candidates.length, 2);
  assert.equal(f.confirmPicker(1001).reason, "VENUE_NOT_SELECTED");
  assert.equal(f.snapshot().step, "VENUE_PICKER");
});

test("returns a real fixture only as an offline draft, with a separate court", async () => {
  const f = flow();
  open(f);
  await f.search("模拟");
  assert.equal(f.chooseCandidate("fixture-bj-001"), true);
  assert.equal(f.editCourt("  B区2号场  "), true);
  const result = f.confirmPicker(1001);
  assert.equal(result.status, "returned_mock_only");
  assert.equal(result.canPersist, false);
  assert.equal(result.verification, "OFFLINE_MOCK_ONLY");
  assert.equal(result.venue.specificCourt, "B区2号场");
  assert.equal(result.venue.venueSource, "mock_poi");
  assert.equal(f.snapshot().step, "FORM");
});

test("manual venue can return without coordinates or court", () => {
  const f = flow();
  open(f, "成都");
  assert.equal(f.useManual("手填球馆", "手填地址"), true);
  const result = f.confirmPicker(1001);
  assert.equal(result.status, "returned_mock_only");
  assert.equal(result.venue.specificCourt, null);
  assert.equal(result.venue.venueSource, "manual");
});

test("service unavailable is distinct from no results and manual fallback works", async () => {
  const f = new OfflineEventCreateVenueFlow(() => ({
    search: async () => ({
      status: "UNAVAILABLE",
      reason: "OFFLINE_POC",
      candidates: [],
    }),
  }));
  open(f);
  await f.search("任意");
  assert.equal(f.snapshot().picker.status, "UNAVAILABLE");
  assert.equal(f.useManual("手填馆", "手填地址"), true);
  assert.equal(f.confirmPicker(1001).status, "returned_mock_only");
});

test("invalid manual venue does not produce a selected candidate", () => {
  const f = flow();
  open(f);
  assert.equal(f.useManual("", "地址"), false);
  assert.equal(f.snapshot().picker.selected, null);
});

test("new parent screen instance starts without inherited venue or ticket", () => {
  const first = flow();
  open(first);
  first.useManual("旧馆", "旧地址");
  first.confirmPicker(1001);
  const remounted = flow();
  assert.equal(remounted.snapshot().venue, null);
  assert.equal(remounted.confirmPicker(1002).reason, "PICKER_NOT_OPEN");
});

test("invalid court fails before consuming the one-shot venue confirmation", async () => {
  const f = flow();
  open(f);
  await f.search("模拟");
  f.chooseCandidate("fixture-bj-001");
  f.editCourt("x".repeat(81));
  assert.equal(f.confirmPicker(1001).reason, "INVALID_COURT_DETAIL");
  assert.equal(f.snapshot().picker.status, "SELECTED");
  f.editCourt("3号场");
  assert.equal(f.confirmPicker(1002).status, "returned_mock_only");
});

test("confirming twice cannot return or persist twice", () => {
  const f = flow();
  open(f);
  f.useManual("球馆", "地址");
  assert.equal(f.confirmPicker(1001).status, "returned_mock_only");
  assert.equal(f.confirmPicker(1002).reason, "PICKER_NOT_OPEN");
});

test("cancel invalidates pending selection without deleting prior returned venue", () => {
  const f = flow();
  open(f);
  f.useManual("旧馆", "旧地址");
  f.confirmPicker(1001);
  f.openPicker(2000);
  f.useManual("新馆", "新地址");
  f.cancelPicker();
  assert.equal(f.snapshot().venue.venueName, "旧馆");
  assert.equal(f.confirmPicker(2001).reason, "PICKER_NOT_OPEN");
});

test("city change clears a previous venue and invalidates picker", () => {
  const f = flow();
  open(f);
  f.useManual("北京馆", "北京地址");
  f.confirmPicker(1001);
  f.changeCity("上海");
  assert.equal(f.snapshot().venue, null);
  assert.equal(f.snapshot().city, "上海");
});

test("A-B-A city switching never restores a previous pending ticket", () => {
  const f = flow();
  open(f);
  f.useManual("旧馆", "旧地址");
  f.changeCity("上海");
  f.changeCity("北京");
  assert.equal(f.confirmPicker(1001).reason, "PICKER_NOT_OPEN");
  assert.equal(f.snapshot().venue, null);
  assert.ok(f.snapshot().revision >= 3);
});

test("parent form edit invalidates the pending return", () => {
  const f = flow();
  open(f);
  f.useManual("馆", "地址");
  assert.equal(f.editTitle("新赛事"), true);
  assert.equal(f.snapshot().step, "FORM");
  assert.equal(f.confirmPicker(1001).reason, "PICKER_NOT_OPEN");
});

test("invalid parent title does not change revision", () => {
  const f = flow();
  f.changeCity("北京");
  const before = f.snapshot().revision;
  assert.equal(f.editTitle("x".repeat(81)), false);
  assert.equal(f.snapshot().revision, before);
});

test("opening a new picker replaces the previous pending selection", () => {
  const f = flow();
  open(f);
  f.useManual("旧馆", "旧地址");
  assert.equal(f.openPicker(1001).status, "opened_mock_only");
  assert.equal(f.snapshot().picker.selected, null);
  assert.equal(f.confirmPicker(1002).reason, "VENUE_NOT_SELECTED");
});

test("late async search cannot re-enter after cancel", async () => {
  const pending = deferred();
  const f = new OfflineEventCreateVenueFlow(() => ({
    search: () => pending.promise,
  }));
  open(f);
  const work = f.search("模拟");
  f.cancelPicker();
  pending.resolve({ status: "NO_RESULTS", candidates: [] });
  await work;
  assert.equal(f.snapshot().step, "FORM");
  assert.equal(f.snapshot().picker, null);
});

test("clock rollback and expiration are blocked by the return gate", () => {
  const f = flow();
  open(f);
  f.useManual("球馆", "地址");
  assert.equal(f.confirmPicker(999).reason, "INVALID_CLOCK");
  f.openPicker(1000);
  f.useManual("球馆", "地址");
  assert.equal(f.confirmPicker(601001).reason, "EXPIRED");
  assert.equal(f.snapshot().venue, null);
});

test("failing offline port factory fails closed without leaving a ticket", () => {
  const f = new OfflineEventCreateVenueFlow(() => {
    throw Error("internal secret");
  });
  f.changeCity("北京");
  assert.equal(f.openPicker(1000).reason, "PORT_UNAVAILABLE");
  assert.equal(f.snapshot().step, "FORM");
  assert.equal(f.confirmPicker(1001).reason, "PICKER_NOT_OPEN");
});

test("invalid clock cannot open a picker", () => {
  const f = flow();
  f.changeCity("北京");
  assert.equal(f.openPicker(NaN).reason, "INVALID_CLOCK");
  assert.equal(f.snapshot().step, "FORM");
});

test("snapshot is detached from internal returned venue", () => {
  const f = flow();
  open(f);
  f.useManual("球馆", "地址");
  f.confirmPicker(1001);
  const s = f.snapshot();
  s.venue.venueName = "恶意修改";
  assert.equal(f.snapshot().venue.venueName, "球馆");
});

test("returned venue contains exactly six safe fields and no credentials", () => {
  const f = flow();
  open(f);
  f.useManual("球馆", "地址");
  const r = f.confirmPicker(1001);
  assert.deepEqual(Object.keys(r.venue).sort(), [
    "city",
    "specificCourt",
    "status",
    "venueAddress",
    "venueName",
    "venueSource",
  ]);
  assert.equal("authUserId" in r.venue, false);
  assert.equal("latitude" in r.venue, false);
});

test("page registration and source stay entirely offline", () => {
  const app = readFileSync(
    new URL("../src/app.config.ts", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL("../src/pages/event-create-poc/index.tsx", import.meta.url),
    "utf8",
  );
  const core = readFileSync(
    new URL("../src/core/event-create-venue-flow.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /pages\/event-create-poc\/index/);
  assert.match(page, /OFFLINE_MOCK_ONLY/);
  assert.match(page, /不会创建赛事/);
  assert.doesNotMatch(
    page + core,
    /wx\.login\(|fetch\(|uploadFile\(|supabase\.auth|service_role|AppSecret|navigateTo\(/,
  );
});
