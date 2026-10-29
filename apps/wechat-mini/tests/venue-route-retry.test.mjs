import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  VenueSelectionPoc,
  OfflineFixtureVenuePort,
} from "../src/core/venue-selection-poc.ts";
import { OfflineVenueRouteDriver } from "../src/core/venue-route-driver.ts";
import { prepareOfflineCourtPreview } from "../src/core/venue-court-draft.ts";

const ctx = () => ({
  formKey: "event-route-poc",
  revision: 1,
  screenEpoch: "screen-42",
  city: "北京",
});
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};

test("manual preview is non-consuming and keeps selection available for retry", () => {
  const picker = new VenueSelectionPoc(new OfflineFixtureVenuePort(), "北京");
  assert.equal(picker.useManual("模拟场馆", "模拟地址"), true);
  const before = picker.snapshot();
  const first = picker.previewDraft();
  const second = picker.previewDraft();
  assert.deepEqual(first, second);
  assert.equal(first.source, "manual");
  assert.deepEqual(picker.snapshot(), before);
  assert.deepEqual(picker.confirm(), first);
  assert.equal(picker.previewDraft(), null);
});

test("mock candidate preview is non-consuming and does not auto-select", async () => {
  const picker = new VenueSelectionPoc(new OfflineFixtureVenuePort(), "北京");
  assert.equal(picker.previewDraft(), null);
  const results = await picker.search("模拟网球场");
  assert.equal(results.status, "RESULTS");
  assert.equal(picker.previewDraft(), null);
  assert.equal(picker.chooseCandidate(results.candidates[0].id), true);
  const before = picker.snapshot();
  assert.equal(picker.previewDraft().source, "mock_poi");
  assert.deepEqual(picker.snapshot(), before);
});

test("preview is null for no selection and after city change", () => {
  const picker = new VenueSelectionPoc(new OfflineFixtureVenuePort(), "北京");
  assert.equal(picker.previewDraft(), null);
  picker.useManual("模拟场馆", "模拟地址");
  picker.setCity("上海");
  assert.equal(picker.previewDraft(), null);
  assert.equal(picker.snapshot().status, "IDLE");
});

test("NAVIGATION_NOT_READY can retry after navigateTo resolves without reselecting", async () => {
  const open = deferred();
  let url = "";
  let backs = 0;
  const driver = new OfflineVenueRouteDriver({
    navigateTo(value) {
      url = value;
      return open.promise;
    },
    async navigateBack() {
      ++backs;
    },
  });
  const picker = new VenueSelectionPoc(new OfflineFixtureVenuePort(), "北京");
  picker.useManual("模拟场馆", "模拟地址");
  const opening = driver.open(ctx(), 1000);
  assert.equal(
    driver.claim({ handoff: url.split("?handoff=")[1] }, 1001).status,
    "claimed_mock_only",
  );
  const first = prepareOfflineCourtPreview(picker.previewDraft(), "3号场");
  assert.equal(first.status, "ready_mock_only");
  const early = await driver.finish(ctx(), first, 1002);
  assert.equal(early.status, "blocked");
  assert.equal(early.reason, "NAVIGATION_NOT_READY");
  assert.equal(picker.snapshot().status, "MANUAL");
  open.resolve();
  assert.equal((await opening).status, "opened_mock_only");
  const second = prepareOfflineCourtPreview(picker.previewDraft(), "3号场");
  assert.equal(
    (await driver.finish(ctx(), second, 1003)).status,
    "returned_mock_only",
  );
  assert.equal((await driver.receive(ctx())).status, "returned_mock_only");
  assert.equal(backs, 1);
});

test("Taro child confirmation uses non-consuming preview, not irreversible confirm", () => {
  const source = readFileSync(
    new URL("../src/pages/venue-route-poc/index.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /active\.previewDraft\(\)/);
  assert.doesNotMatch(source, /active\.confirm\(\)/);
  assert.match(source, /interaction\.current\.beginConfirm\(\)/);
  assert.match(source, /interaction\.current\.settleConfirm\(returned\)/);
});
