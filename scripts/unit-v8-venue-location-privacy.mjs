import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// V8-05: ordinary event creators should see a readable venue address,
// not technical latitude/longitude values in the location confirmation card.
const form = await readFile(new URL("../src/pages/EventFormPage.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/venue-v3.css", import.meta.url), "utf8");
const picker = await readFile(new URL("../src/components/VenueMapPicker.tsx", import.meta.url), "utf8");
assert.match(form, /venue-location-confirmed/, "location card must remain present");
assert.match(form, /form\.venue_address/, "readable address must remain visible");
assert.match(form, /<details><summary>/, "legacy coordinate disclosure must be explicitly covered");
assert.match(css, /\.event-form-page\s+\.venue-location-confirmed\s*>\s*details\s*\{\s*display:\s*none\s*;/,
  "the coordinate-only details element must not be displayed");
assert.match(form, /import \{ VenueMapPicker \} from "\.\.\/components\/VenueMapPicker";/,
  "event form must still load the picker stylesheet through VenueMapPicker");
assert.match(picker, /import "\.\.\/venue-v3\.css";/,
  "venue stylesheet must be loaded on the event form route");
console.log("PASS V8 venue confirmation hides technical coordinates while retaining readable address");
