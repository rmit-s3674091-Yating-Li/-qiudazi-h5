import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

await import("./unit-v8-venue-picker-geolocation-feedback.mjs");

const root = new URL("../", import.meta.url);
const tmp = await mkdtemp(join(tmpdir(), "qiudazi-venue-"));
const base = {
  name: "Venue test", visibility: "public", match_type: "singles", format: "round_robin",
  best_of: 1, scoring_type: "games_6", game_scoring: "advantage", tiebreak_trigger: 6,
  custom_games_target: null, city: "Shanghai", venue: "  Tennis Center  ",
  venue_name: null, venue_address: "  1 Court Road  ", venue_latitude: null,
  venue_longitude: null, venue_place_id: null, venue_provider: null,
  event_date: "2026-09-20", event_time: "10:00", registration_deadline: null,
  suggested_level_min: null, suggested_level_max: null, entry_limit: null,
  group_count: null, qualifiers_per_group: null, venue_fee_total: null,
  ball_fee_total: null, other_fee_total: null, fixed_fee_per_entry: null,
  fee_type: "free", link_signup_enabled: true, level: null,
};

async function compile(path, out) {
  const source = await readFile(new URL(path, root), "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, verbatimModuleSyntax: true },
    fileName: path,
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length ?? 0, 0, `${path} must transpile`);
  await writeFile(join(tmp, out), result.outputText.replace(/(from\s+["'](?:\.\.?\/)[^"']+)\.ts(["'])/g, "$1.js$2"), "utf8");
  return source;
}

function requires(source, patterns, label) {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: ${pattern}`);
}

try {
  await import("./unit-v8-venue-location-merge.mjs");
  await import("./unit-v8-venue-reverse-language-fallback.mjs");
  await compile("src/domain/types.ts", "types.js");
  const rulesSource = await compile("src/domain/EventRules.ts", "EventRules.js");
  const mapSource = await compile("src/utils/mapProvider.ts", "mapProvider.js");
  const [formSource, pickerSource, eventSource, quickSource, migration] = await Promise.all([
    "src/pages/EventFormPage.tsx", "src/components/VenueMapPicker.tsx",
    "src/pages/EventPage.tsx", "src/pages/QuickStartPage.tsx",
    "supabase/migrations/20260905183000_standard_event_venue_location.sql",
  ].map((path) => readFile(new URL(path, root), "utf8")));
  const events = await import(pathToFileURL(join(tmp, "EventRules.js")).href);
  const maps = await import(pathToFileURL(join(tmp, "mapProvider.js")).href);

  const normalized = events.validateEvent({ ...base });
  assert.equal(normalized.venue, "Tennis Center");
  assert.equal(normalized.venue_name, null);
  assert.equal(normalized.venue_address, "1 Court Road");
  const splitVenue = events.validateEvent({ ...base, venue_name: "Olympic Tennis Center", venue: "Court 3" });
  assert.equal(splitVenue.venue_name, "Olympic Tennis Center");
  assert.equal(splitVenue.venue, "Court 3");
  const positioned = events.validateEvent({ ...base, venue_latitude: 31.2, venue_longitude: 121.5, venue_provider: "device_geolocation" });
  assert.equal(positioned.venue_latitude, 31.2);
  assert.equal(positioned.venue_longitude, 121.5);
  assert.throws(() => events.validateEvent({ ...base, venue_latitude: 31.2, venue_longitude: null }), /VENUE_COORDINATES|经纬度/);
  assert.throws(() => events.validateEvent({ ...base, venue_latitude: 91, venue_longitude: 121.5 }), /VENUE_COORDINATES|纬度/);
  assert.throws(() => events.validateEvent({ ...base, venue_latitude: 31.2, venue_longitude: 181 }), /VENUE_COORDINATES|经度/);
  assert.equal(maps.hasVenueCoordinates({ venue_latitude: 0, venue_longitude: 0 }), true);
  assert.equal(maps.hasVenueCoordinates({ venue_latitude: null, venue_longitude: null }), false);
  assert.match(maps.browserMapProvider.externalMapUrl({ latitude: 31.2, longitude: 121.5 }), /^https:\/\/www\.openstreetmap\.org\//);
  assert.match(maps.browserMapProvider.externalDirectionsUrl({ latitude: 31.2, longitude: 121.5, name: "Tennis Center" }), /^https:\/\/maps\.apple\.com\/\?daddr=/);
  // A GPS timeout or provider outage is not a permission denial. Preserve the
  // separate fallback copy in EventFormPage for genuinely denied permissions.
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    for (const [code, expected] of [
      [1, "GEOLOCATION_DENIED"],
      [2, "GEOLOCATION_UNAVAILABLE"],
      [3, "GEOLOCATION_TIMEOUT"],
    ]) {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { geolocation: { getCurrentPosition(_ok, fail) { fail({ code }); } } },
      });
      await assert.rejects(maps.browserMapProvider.getCurrentPosition(),
        error => error instanceof Error && error.message === expected,
        `geolocation error ${code} must be classified as ${expected}`);
    }
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  }

  requires(formSource, [
    /添加场馆定位/, /使用当前位置/, /VenueMapPicker/, /confirmMapLocation/,
    /mergeVenueLocation\(f,\{latitude,longitude,provider:"openstreetmap"\}/,
    /mergeVenueLocation\(f,location,place,"device"\)/,
    /地图选点/, /比赛场馆（可选）/, /场馆定位（可选）/,
    /场馆地址/, /具体场地（可选）/,
    /地图会优先根据“城市 \+ 比赛场馆”定位到附近位置/,
    /setVenueLocationOpen/, /place\?\.name\?\.trim\(\)\?"explicit_poi":"pin"/,
    /initialCity=\{form\.city\}/, /initialVenueName=\{form\.venue_name\}/,
    /initialAddress=\{form\.venue_address\}/,
  ], "standard event venue form");
  assert.doesNotMatch(formSource, /搜索场地或地址|createConfiguredBaiduMapProvider|searchPlaces/);
  assert.doesNotMatch(formSource, /venue:!f\.venue&&place\?\.name/, "POI must not fill specific court field");
  assert.doesNotMatch(formSource, /address,venue,city/, "venue-only global geocoding must stay disabled");
  assert.ok(formSource.indexOf("setVenueLocationOpen") < formSource.indexOf("getCurrentPosition"));

  requires(mapSource, [
    /navigator\.geolocation\.getCurrentPosition/, /reverseGeocode/,
    /nominatim\.openstreetmap\.org\/search/, /viewbox/, /bounded/,
    /boundingBox/, /accept-language/, /nominatim\.openstreetmap\.org\/reverse/,
    /openstreetmap_nominatim/,
  ], "map provider");
  requires(eventSource, [
    /browserMapProvider, hasVenueCoordinates/, /e\.event_mode!=="quick"&&hasVenueCoordinates\(e\)/,
    /e\.venue_address/, /event-venue-address/, /e\.venue!==e\.venue_name/,
    /externalDirectionsUrl/, /导航/, /查看地图/, /EventVenueMap/,
    /setShowVenueMap\(true\)/, /target="_blank"/, /rel="noreferrer"/,
  ], "event venue display");
  assert.doesNotMatch(eventSource, /externalMapUrl|getCurrentPosition\(/);
  assert.doesNotMatch(quickSource, /mapProvider|geolocation|getCurrentPosition|venue_latitude|venue_longitude/);
  for (const column of ["venue_name", "venue_address", "venue_latitude", "venue_longitude", "venue_place_id", "venue_provider"]) {
    assert.match(migration, new RegExp(column));
  }
  requires(migration, [
    /events_venue_coordinate_pair_check/,
    /array\['name'.*'venue_name'.*'venue_latitude'.*'venue_provider'/s,
    /venue=e\.venue,venue_name=e\.venue_name,venue_address=e\.venue_address/,
  ], "venue migration");
  assert.match(rulesSource, /venue_name/);

  const pickerTs = ts.transpileModule(pickerSource, {
    fileName: "VenueMapPicker.tsx", reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  assert.equal(pickerTs.diagnostics?.length ?? 0, 0, "V8 picker must transpile");
  requires(pickerSource, [
    /tile\.openstreetmap\.org/, /venue-map-crosshair/, /ensureLeaflet/,
    /searchVariants\(term\)/, /rankPlaces\(mergePlaces\(groups\),term\)/,
    /collectVenueSearch<VenuePlace>\(/, /createConfiguredBaiduMapProvider/,
    /resolveVenueCityBounds/, /isWithinVenueCityBounds/,
    /searchSeq\.current/, /setSearchCompleted/, /setResults\(found\)/,
    /!found\.length&&hadFailure/, /noResultsCopy/,
    /venue-picker-results/, /venue-picker-result/, /result\.name/, /result\.address/,
    /onClick=\{\(\)=>applyPlace\(result\)\}/,
    /reverseLocationHint\(found\)/, /setPlace\(null\)/,
    /cityFallback/, /!cityFallback/, /!searchOpen/,
    /venue-picker-current/, /Use current location|使用当前位置/,
    /disabled=\{!canConfirm\}/, /onConfirm\(position\.lat,position\.lng,place\)/,
  ], "V8 venue picker");
  assert.match(pickerSource, /bounds\?items\.filter\(item=>isWithinVenueCityBounds\(item,bounds\)\):items/,
    "English candidates must be city-bounded when a city is selected");
  assert.match(pickerSource, /if\(cancelled\)return/, "stale search must not update candidates");
  assert.doesNotMatch(pickerSource, /setPlace\(\{name:found\.name/,
    "reverse geocoding must not silently claim a venue POI");
  console.log("Standard venue location and V8 picker contract tests passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
