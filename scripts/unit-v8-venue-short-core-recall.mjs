#!/usr/bin/env node
// Deterministic exact-source regression only; never represents a live Baidu query.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
const source = readFileSync(
  new URL("../api/venue-search.js", import.meta.url),
  "utf8",
);
const start = source.indexOf("function queryVariants(");
const end = source.indexOf("async function readJson(", start);
assert.ok(start >= 0 && end > start, "queryVariants source boundaries missing");
const fn = vm.runInNewContext(`${source.slice(start, end)}\nqueryVariants`);
const variants = (q, city) => Array.from(fn(q, city));
test("distinctive short tennis cores are queried without hardcoded POI names", () => {
  assert.ok(variants("旗忠网球中心", "上海").includes("旗忠"));
  assert.ok(variants("仙霞网球中心", "上海").includes("仙霞"));
  assert.ok(variants("虹桥网球中心", "上海").includes("虹桥"));
});
test("do not expand generic short cores or unrelated categories", () => {
  assert.ok(!variants("国家网球中心", "北京").includes("国家"));
  assert.ok(!variants("环球中心", "成都").includes("环球"));
  assert.ok(!variants("犀浦站", "成都").includes("犀浦"));
});
test("retain existing 奥森/绿心 aliases and bounded fanout", () => {
  assert.ok(variants("奥森", "北京").includes("奥林匹克森林公园"));
  assert.ok(variants("绿心公园", "北京").includes("北京城市绿心森林公园"));
  assert.ok(variants("旗忠网球中心", "上海").length <= 5);
});
