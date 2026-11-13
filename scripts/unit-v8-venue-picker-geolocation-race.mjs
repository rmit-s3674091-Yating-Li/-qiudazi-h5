import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/components/VenueMapPicker.tsx", "utf8");
assert.match(source, /locationSeq=useRef\(0\)/);
assert.match(source, /function applyPlace\([^\n]*locationSeq\.current\+\+;invalidateReverseLookup\(\)/);
assert.match(source, /map\.on\("dragstart",\(\)=>\{dragged\.current=true;locationSeq\.current\+\+;invalidateReverseLookup\(\)\}\)/);
assert.match(source, /return\(\)=>\{cancelled=true;locationSeq\.current\+\+;/);
assert.match(source, /function locate\(\)\{const seq=\+\+locationSeq\.current;invalidateReverseLookup\(\)/);
assert.match(source, /if\(seq!==locationSeq\.current\)return;/);
assert.match(source, /if\(seq===locationSeq\.current\)setError/);
console.log("PASS: V8 venue picker latest-intent geolocation guards");
