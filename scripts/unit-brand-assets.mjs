import assert from "node:assert/strict";
import fs from "node:fs";

const icon = fs.readFileSync("public/brand-icon.svg", "utf8");
const cover = fs.readFileSync("public/share-cover.svg", "utf8");
const index = fs.readFileSync("index.html", "utf8");

const canonicalArc = "M352 151a151 151 0 1 0 18 191";
const canonicalTail = "M353 151a151 151 0 0 1 29 34";

assert.ok(icon.includes(canonicalArc) && icon.includes(canonicalTail), "brand icon must keep canonical C geometry");
assert.ok(cover.includes(canonicalArc) && cover.includes(canonicalTail), "share cover source must embed canonical C geometry");

const png = fs.readFileSync("public/share-cover.png");
assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "share cover must be a real PNG");
assert.equal(png.readUInt32BE(16), 220, "share cover PNG width must be 220");
assert.equal(png.readUInt32BE(20), 220, "share cover PNG height must be 220");
assert.ok(png.length > 10000, "share cover PNG must contain non-trivial raster content");

const shareUrl = "https://raw.githubusercontent.com/rmit-s3674091-Yating-Li/-qiudazi-h5/refs/heads/feature/20260902-next-version-scoring-quick-photo/public/share-cover.png";
assert.ok(index.includes(`property="og:image" content="${shareUrl}"`), "Open Graph must use crawler-accessible absolute raster URL");
assert.ok(index.includes(`property="og:image:secure_url" content="${shareUrl}"`), "Open Graph must provide secure image URL");
assert.ok(index.includes(`name="twitter:image" content="${shareUrl}"`), "Twitter card must use the same absolute raster URL");
assert.ok(index.includes('property="og:image:type" content="image/png"'), "Open Graph must declare image/png");
assert.ok(!index.includes('property="og:image" content="/share-cover.png"'), "Open Graph must not regress to relative image URL");

console.log("unit-brand-assets: ok");
