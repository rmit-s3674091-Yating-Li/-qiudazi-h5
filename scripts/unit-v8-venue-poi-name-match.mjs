import test from "node:test";
import assert from "node:assert/strict";
import { nameMatch } from "./v8-venue-poi-regression.mjs";

test("city prefix omitted after independently proven city", () => {
  assert.equal(
    nameMatch("城市绿心森林公园", "绿心公园", "北京城市绿心森林公园", "北京"),
    "ALIAS",
  );
  assert.equal(
    nameMatch("仙霞网球中心", "仙霞网球中心", "上海市仙霞网球中心", "上海"),
    "EXACT_NAME",
  );
  assert.equal(
    nameMatch(
      "旗忠森林体育城网球中心",
      "旗忠网球中心",
      "上海旗忠森林体育城网球中心",
      "上海",
    ),
    "ALIAS",
  );
});
test("no false alias for missing or mismatched city", () => {
  assert.equal(
    nameMatch("城市绿心森林公园", "绿心公园", "北京城市绿心森林公园", ""),
    "NONE",
  );
  assert.equal(
    nameMatch("城市绿心森林公园", "绿心公园", "北京城市绿心森林公园", "上海"),
    "NONE",
  );
});
test("gate/parking/nearby candidates never count as canonical alias", () => {
  assert.notEqual(
    nameMatch(
      "城市绿心森林公园东门",
      "绿心公园",
      "北京城市绿心森林公园",
      "北京",
    ),
    "ALIAS",
  );
  assert.notEqual(
    nameMatch(
      "城市绿心森林公园停车场",
      "绿心公园",
      "北京城市绿心森林公园",
      "北京",
    ),
    "ALIAS",
  );
  assert.equal(
    nameMatch("奥林匹克森林公园", "奥森", "奥林匹克森林公园", "北京"),
    "ALIAS",
  );
});
