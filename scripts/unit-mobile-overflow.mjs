import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/v7-mobile.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

for (const selector of ['input[type="date"]', 'input[type="datetime-local"]', 'select']) {
  assert.ok(css.includes(selector), `missing native-control selector: ${selector}`);
}
for (const rule of ["max-width: 100%", "min-width: 0", "box-sizing: border-box", "overflow-x: hidden"]) {
  assert.ok(css.includes(rule), `missing mobile containment rule: ${rule}`);
}
assert.ok(main.includes('import "./v7-mobile.css"'), "V7 mobile containment stylesheet must be loaded");
console.log("V7 mobile overflow contract: PASS");
