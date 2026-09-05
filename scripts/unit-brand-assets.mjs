import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const icon = fs.readFileSync("public/brand-icon.svg", "utf8");
const cover = fs.readFileSync("public/share-cover.svg", "utf8");
const index = fs.readFileSync("index.html", "utf8");

const canonicalArc = "M352 151a151 151 0 1 0 18 191";
const canonicalTail = "M353 151a151 151 0 0 1 29 34";

assert.ok(icon.includes(canonicalArc) && icon.includes(canonicalTail), "brand icon must keep canonical C geometry");
assert.ok(cover.includes(canonicalArc) && cover.includes(canonicalTail), "share cover must embed canonical C geometry");
assert.ok(cover.includes('fill="#8e9b7a"'), "share cover C mark must keep canonical sage background");
assert.ok(cover.includes('stroke="#f6f4ec"'), "share cover C mark must keep canonical off-white stroke");
assert.ok(!cover.includes('cx="110" cy="104"'), "legacy three-dot pseudo-logo must not return");
assert.ok(!cover.includes('cx="178" cy="78"'), "legacy three-dot pseudo-logo must not return");
assert.ok(!cover.includes('cx="232" cy="122"'), "legacy three-dot pseudo-logo must not return");

execFileSync(process.execPath, ["scripts/generate-share-cover-png.mjs"], { stdio: "pipe" });
const png = fs.readFileSync("public/share-cover.png");
assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "share cover must be a real PNG");
assert.equal(png.readUInt32BE(16), 1200, "share cover PNG width must be 1200");
assert.equal(png.readUInt32BE(20), 1200, "share cover PNG height must be 1200");
assert.ok(png.length > 10000, "share cover PNG must contain non-trivial raster content");
assert.ok(index.includes('property="og:image" content="/share-cover.png"'), "Open Graph must use raster share cover");
assert.ok(index.includes('name="twitter:image" content="/share-cover.png"'), "Twitter card must use raster share cover");
assert.ok(index.includes('property="og:image:type" content="image/png"'), "Open Graph must declare image/png");
assert.ok(!index.includes('property="og:image" content="/share-cover.svg"'), "Open Graph must not regress to SVG");

console.log("unit-brand-assets: ok");
