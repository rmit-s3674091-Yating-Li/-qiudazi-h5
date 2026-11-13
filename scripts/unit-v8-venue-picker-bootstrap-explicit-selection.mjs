import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/components/VenueMapPicker.tsx", "utf8");
assert.match(source, /useState\(initialVenueName\|\|initialAddress\|\|""\)/,
  "existing address should be a search hint when a venue name is absent");
assert.doesNotMatch(source, /if\(items\[0\]\)\{applyPlace\(items\[0\]\)/,
  "initial address lookup must never auto-select the first POI");
assert.match(source, /function locate\(\)\{const seq=\+\+locationSeq\.current;invalidateReverseLookup\(\);/,
  "current-location intent must invalidate an in-flight city bootstrap");
assert.match(source, /map\.on\("dragstart",\(\)=>\{dragged\.current=true;locationSeq\.current\+\+;invalidateReverseLookup\(\)\}\)/,
  "drag intent must invalidate an in-flight city bootstrap");
assert.match(source, /const bootstrapEpoch=lookupSeq\.current;/);
assert.match(source, /if\(cancelled\|\|lookupSeq\.current!==bootstrapEpoch\)return/);
assert.match(source, /if\(!cancelled&&lookupSeq\.current===bootstrapEpoch\)setResolving\(false\)/);
assert.doesNotMatch(source, /searchPlaces\(address/,
  "bootstrap must not turn an address hint into a selected venue");
console.log("PASS: V8 venue bootstrap requires explicit POI selection");
