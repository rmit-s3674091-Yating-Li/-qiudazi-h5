import assert from "node:assert/strict";
import fs from "node:fs";

const icon = fs.readFileSync("public/brand-icon.svg", "utf8");
const cover = fs.readFileSync("public/share-cover.svg", "utf8");

const canonicalArc = "M352 151a151 151 0 1 0 18 191";
const canonicalTail = "M353 151a151 151 0 0 1 29 34";

assert.ok(icon.includes(canonicalArc) && icon.includes(canonicalTail), "brand icon must keep canonical C geometry");
assert.ok(cover.includes(canonicalArc) && cover.includes(canonicalTail), "share cover must embed canonical C geometry");
assert.ok(cover.includes('fill="#8e9b7a"'), "share cover C mark must keep canonical sage background");
assert.ok(cover.includes('stroke="#f6f4ec"'), "share cover C mark must keep canonical off-white stroke");
assert.ok(!cover.includes('cx="110" cy="104"'), "legacy three-dot pseudo-logo must not return");
assert.ok(!cover.includes('cx="178" cy="78"'), "legacy three-dot pseudo-logo must not return");
assert.ok(!cover.includes('cx="232" cy="122"'), "legacy three-dot pseudo-logo must not return");

console.log("unit-brand-assets: ok");
