#!/usr/bin/env node
// Test the actual rankPlaces helper extracted from VenueMapPicker.tsx.
// This is deterministic source-level coverage, NOT a live Baidu API or iPhone test.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(
  new URL("../src/components/VenueMapPicker.tsx", import.meta.url),
  "utf8",
);
const begin = source.indexOf("function normalizeText(");
const end = source.indexOf("export function VenueMapPicker(", begin);
assert.ok(begin >= 0 && end > begin, "rank helper source boundary missing");
const snippet = `${source.slice(begin, end)}\nexport { rankPlaces };`;
const js = ts.transpileModule(snippet, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const exports = {};
vm.runInNewContext(js, { exports, module: { exports } });
const { rankPlaces } = exports;
assert.equal(typeof rankPlaces, "function");
const poi = (name, address = "上海市闵行区") => ({
  name,
  address,
  provider: "baidu",
  placeId: null,
  latitude: 31.0,
  longitude: 121.0,
});
const names = (query, places) =>
  Array.from(rankPlaces(places, query), (x) => x.name);
test("two-character core retains official 旗忠 POI despite intervening descriptor", () => {
  assert.deepEqual(names("旗忠网球中心", [poi("上海旗忠森林体育城网球中心")]), [
    "上海旗忠森林体育城网球中心",
  ]);
});
test("do not accept unrelated sports facility or address-only core", () => {
  assert.deepEqual(
    names("旗忠网球中心", [
      poi("旗忠森林体育城篮球馆"),
      poi("虹桥网球中心", "上海市旗忠路"),
    ]),
    [],
  );
});
test("known 奥森 and 绿心公园 recall remains intact", () => {
  assert.deepEqual(names("奥森", [poi("奥林匹克森林公园")]), [
    "奥林匹克森林公园",
  ]);
  assert.deepEqual(names("绿心公园", [poi("北京城市绿心森林公园")]), [
    "北京城市绿心森林公园",
  ]);
});
test("exact name and category-transparent negative controls", () => {
  assert.deepEqual(names("国家网球中心", [poi("国家网球中心")]), [
    "国家网球中心",
  ]);
  assert.deepEqual(names("旗忠网球中心", [poi("旗忠森林公园")]), []);
});
