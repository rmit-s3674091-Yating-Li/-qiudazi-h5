import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  VenueSelectionPoc,
  OfflineFixtureVenuePort,
} from "../src/core/venue-selection-poc.ts";

const newPicker = () =>
  new VenueSelectionPoc(new OfflineFixtureVenuePort(), "北京");
const fixture = {
  id: "fixture-bj-001",
  name: "北京模拟网球场 A",
  address: "北京市·模拟地址 A（非真实场馆）",
};

test("manual name edit invalidates previously selected venue", () => {
  const picker = newPicker();
  assert.equal(picker.useManual("原场馆", "原地址"), true);
  assert.equal(picker.previewDraft()?.name, "原场馆");
  picker.invalidateInputDraft();
  assert.equal(picker.previewDraft(), null);
  assert.equal(picker.snapshot().selected, null);
  assert.equal(picker.snapshot().status, "IDLE");
});

test("manual address edit clears previous manual draft", () => {
  const picker = newPicker();
  picker.useManual("A", "旧地址");
  picker.invalidateInputDraft();
  assert.equal(picker.confirm(), null);
  assert.equal(picker.snapshot().draft, null);
});

test("query edit clears selected POI and stale candidate list", async () => {
  const picker = newPicker();
  await picker.search("模拟");
  assert.equal(picker.chooseCandidate(fixture.id), true);
  picker.invalidateInputDraft();
  assert.equal(picker.previewDraft(), null);
  assert.deepEqual(picker.snapshot().candidates, []);
});

test("query edit invalidates late asynchronous search response", async () => {
  let resolve;
  const picker = new VenueSelectionPoc(
    {
      search: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
    "北京",
  );
  const pending = picker.search("模拟");
  assert.equal(picker.snapshot().status, "SEARCHING");
  picker.invalidateInputDraft();
  resolve({ status: "RESULTS", candidates: [fixture] });
  await pending;
  assert.equal(picker.snapshot().status, "IDLE");
  assert.deepEqual(picker.snapshot().candidates, []);
});

test("invalidation preserves the parent-selected city", () => {
  const picker = newPicker();
  picker.useManual("A", "B");
  picker.invalidateInputDraft();
  assert.equal(picker.snapshot().city, "北京");
});

test("fresh search after query edit still works", async () => {
  const picker = newPicker();
  await picker.search("模拟");
  picker.invalidateInputDraft();
  await picker.search("网球场");
  assert.equal(picker.snapshot().status, "RESULTS");
  assert.ok(picker.snapshot().candidates.length > 0);
});

test("fresh explicit manual choice after edit can be confirmed", () => {
  const picker = newPicker();
  picker.useManual("旧", "旧地址");
  picker.invalidateInputDraft();
  picker.useManual("新", "新地址");
  assert.equal(picker.previewDraft()?.name, "新");
  assert.equal(picker.confirm()?.name, "新");
});

test("invalidation clears already confirmed offline draft", () => {
  const picker = newPicker();
  picker.useManual("旧", "旧地址");
  picker.confirm();
  picker.invalidateInputDraft();
  assert.equal(picker.snapshot().draft, null);
  assert.equal(picker.snapshot().status, "IDLE");
});

test("repeated input edits cannot resurrect selection", () => {
  const picker = newPicker();
  picker.useManual("旧", "旧地址");
  picker.invalidateInputDraft();
  picker.invalidateInputDraft();
  assert.equal(picker.previewDraft(), null);
  assert.equal(picker.confirm(), null);
});

test("Taro child page invalidates all venue identity inputs, not court", () => {
  const source = readFileSync(
    new URL("../src/pages/venue-route-poc/index.tsx", import.meta.url),
    "utf8",
  );
  for (const setter of ["setQuery", "setName", "setAddress"]) {
    assert.match(
      source,
      new RegExp(
        `${setter}\\(event\\.detail\\.value\\);\\s*picker\\.current\\?\\.invalidateInputDraft\\(\\)`,
      ),
    );
  }
  assert.match(
    source,
    /onInput=\{\(event\) => setCourt\(event\.detail\.value\)\}/,
  );
});
