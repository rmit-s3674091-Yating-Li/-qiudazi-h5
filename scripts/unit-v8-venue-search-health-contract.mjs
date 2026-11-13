import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
// The former unauthenticated health probe was intentionally removed.
// Do not restore a test that imports a deleted API route.
assert.equal(existsSync("api/venue-search-health.js"), false);
const proxy = readFileSync("api/venue-search.js", "utf8");
assert.match(proxy, /AUTH_REQUIRED/);
assert.match(proxy, /VENUE_POI_STAGE/);
console.log(
  "PASS: unauthenticated health route removed; authenticated diagnostics retained",
);
