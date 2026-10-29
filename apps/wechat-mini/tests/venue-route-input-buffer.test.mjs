import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OfflineVenueRouteInputBuffer } from "../src/core/venue-route-input-buffer.ts";

const source = () =>
  readFileSync(
    new URL("../src/pages/venue-route-poc/index.tsx", import.meta.url),
    "utf8",
  );

test("default query is the offline fixture keyword", () => {
  const buffer = new OfflineVenueRouteInputBuffer();
  assert.equal(buffer.searchQuery(), "模拟");
  assert.deepEqual(buffer.manualValues(), { name: "", address: "" });
});

test("same-turn search reads the last onInput value without a React rerender", () => {
  const buffer = new OfflineVenueRouteInputBuffer();
  const staleRenderValue = buffer.searchQuery();
  buffer.update("query", "北京模拟网球场");
  assert.equal(staleRenderValue, "模拟");
  assert.equal(buffer.searchQuery(), "北京模拟网球场");
});

test("manual name and address are both read synchronously", () => {
  const buffer = new OfflineVenueRouteInputBuffer();
  const staleRender = buffer.manualValues();
  buffer.update("name", "最新场馆");
  buffer.update("address", "最新地址");
  assert.deepEqual(staleRender, { name: "", address: "" });
  assert.deepEqual(buffer.manualValues(), {
    name: "最新场馆",
    address: "最新地址",
  });
});

test("last of multiple same-turn input updates wins", () => {
  const buffer = new OfflineVenueRouteInputBuffer();
  buffer.update("query", "A");
  buffer.update("query", "AB");
  buffer.update("query", "ABC");
  assert.equal(buffer.searchQuery(), "ABC");
});

test("clearing a field is preserved, not replaced by a stale nonempty value", () => {
  const buffer = new OfflineVenueRouteInputBuffer();
  buffer.update("name", "原场馆");
  buffer.update("name", "");
  assert.equal(buffer.manualValues().name, "");
});

test("nonstring input and invalid runtime field cannot change the buffer", () => {
  const buffer = new OfflineVenueRouteInputBuffer();
  buffer.update("query", "正确值");
  assert.equal(buffer.update("query", null), false);
  assert.equal(buffer.update("query", 12), false);
  assert.equal(buffer.update("__proto__", "pollute"), false);
  assert.equal(buffer.searchQuery(), "正确值");
});

test("manual snapshot is a detached copy", () => {
  const buffer = new OfflineVenueRouteInputBuffer();
  buffer.update("name", "真实输入");
  const snapshot = buffer.manualValues();
  snapshot.name = "tamper";
  assert.equal(buffer.manualValues().name, "真实输入");
});

test("independent instances never share user input", () => {
  const a = new OfflineVenueRouteInputBuffer();
  const b = new OfflineVenueRouteInputBuffer();
  a.update("query", "A");
  assert.equal(b.searchQuery(), "模拟");
});

test("page uses latest query for search rather than render closure", () => {
  const page = source();
  assert.match(
    page,
    /active\.search\(latestInputs\.current\.searchQuery\(\)\)/,
  );
  assert.doesNotMatch(page, /active\.search\(query\)/);
});

test("page uses latest manual values rather than render closures", () => {
  const page = source();
  assert.match(page, /latestInputs\.current\.manualValues\(\)/);
  assert.match(page, /useManual\(currentName, currentAddress\)/);
  assert.doesNotMatch(page, /useManual\(name, address\)/);
});

test("all three identity inputs synchronously update buffer before React state", () => {
  const page = source();
  for (const [field, setter] of [
    ["query", "setQuery"],
    ["name", "setName"],
    ["address", "setAddress"],
  ]) {
    assert.match(
      page,
      new RegExp(
        `if \\(\\s*!latestInputs\\.current\\.update\\("${field}", event\\.detail\\.value\\)\\s*\\)\\s*return;\\s*${setter}\\(event\\.detail\\.value\\)`,
      ),
    );
  }
});

test("existing picker invalidation, court ref, and transaction gate remain wired", () => {
  const page = source();
  assert.equal(
    (page.match(/picker\.current\?\.invalidateInputDraft\(\)/g) ?? []).length,
    3,
  );
  assert.match(page, /validateSpecificCourt\(latestCourt\.current\)/);
  assert.match(page, /interaction\.current\.beginConfirm\(\)/);
  assert.match(page, /interaction\.current\.cancel\(\)/);
});
