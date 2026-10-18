import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "qiudazi-venue-merge-"));
try {
  const source = await readFile(new URL("../src/domain/VenueLocationMerge.ts", import.meta.url), "utf8");
  const result = ts.transpileModule(source, {
    fileName: "VenueLocationMerge.ts", reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  assert.equal(result.diagnostics?.length ?? 0, 0, "venue merge must transpile");
  const path = join(dir, "VenueLocationMerge.mjs");
  await writeFile(path, result.outputText, "utf8");
  const { mergeVenueLocation } = await import(pathToFileURL(path).href);
  const base = {
    venue_name: "Old venue", venue_address: "Old address", venue_latitude: 1,
    venue_longitude: 2, venue_provider: "baidu", venue_place_id: "old-poi", venue: "Court 3",
  };
  const coords = { latitude: 39.9, longitude: 116.4, provider: "openstreetmap" };
  const newPoi = { name: "New tennis venue", address: "New street", provider: "baidu", placeId: "new-poi" };
  const selected = mergeVenueLocation(base, coords, newPoi, "explicit_poi");
  assert.deepEqual({ name: selected.venue_name, address: selected.venue_address, id: selected.venue_place_id,
    provider: selected.venue_provider, lat: selected.venue_latitude, lng: selected.venue_longitude, court: selected.venue },
    { name: "New tennis venue", address: "New street", id: "new-poi", provider: "baidu", lat: 39.9, lng: 116.4, court: "Court 3" });
  // Reopening an existing POI and confirming without moving the pin must not
  // replace its verified identity/address with a nearby reverse-geocode hint.
  const reopened = mergeVenueLocation(selected, coords,
    { name: "", address: "Nearby cafe", provider: "openstreetmap_nominatim", placeId: null }, "pin");
  assert.deepEqual(reopened, selected, "unchanged pin must preserve the selected POI");
  assert.deepEqual(mergeVenueLocation(selected, coords, null, "pin"), selected,
    "failed reverse lookup must not erase an unchanged POI");
  // Saved manual/pin venues have no place ID. Reopening and confirming the
  // same coordinates must not overwrite their address with a nearby business.
  const savedPin = { ...selected, venue_name: "Community courts", venue_address: "Saved gate address",
    venue_provider: "openstreetmap_nominatim", venue_place_id: null };
  const nearbyHint = { name: "", address: "Nearby cafe", provider: "baidu", placeId: null };
  assert.deepEqual(mergeVenueLocation(savedPin, coords, nearbyHint, "pin"), savedPin,
    "unchanged manual pin must preserve the saved venue and address");
  assert.deepEqual(mergeVenueLocation(savedPin, coords, null, "pin"), savedPin,
    "reverse lookup failure must not clear a saved manual pin");
  const movedPin = mergeVenueLocation(savedPin, { ...coords, longitude: 116.41 }, nearbyHint, "pin");
  assert.equal(movedPin.venue_address, "Nearby cafe", "moving pin must accept the new address hint");
  assert.equal(movedPin.venue_longitude, 116.41);
  assert.equal(movedPin.venue_place_id, null);
  const replaced = mergeVenueLocation(selected, coords,
    { ...newPoi, name: "Replacement venue", placeId: "replacement-poi" }, "explicit_poi");
  assert.equal(replaced.venue_name, "Replacement venue", "explicit POI selection must still replace the venue");
  assert.equal(replaced.venue_place_id, "replacement-poi");
  const sameLocationGps = mergeVenueLocation(selected, { ...coords, provider: "device_geolocation" }, null, "device");
  assert.equal(sameLocationGps.venue_place_id, null, "GPS is not a POI confirmation even at the same coordinates");
  const dragged = mergeVenueLocation(selected, { ...coords, latitude: 39.8 },
    { name: "", address: "Nearby street", provider: "baidu", placeId: null }, "pin");
  assert.equal(dragged.venue_name, null, "old selected POI name must not remain after moving pin");
  assert.equal(dragged.venue_address, "Nearby street");
  assert.equal(dragged.venue_place_id, null);
  const manual = { ...base, venue_name: "User-entered venue", venue_place_id: null };
  assert.equal(mergeVenueLocation(manual, coords, null, "pin").venue_name, "User-entered venue");
  assert.equal(mergeVenueLocation(manual, coords, null, "pin").venue_address, null,
    "missing reverse lookup must not keep a stale address");
  const gps = mergeVenueLocation(manual, { ...coords, provider: "device_geolocation" },
    { name: "Unrelated cafe", address: "Street address", provider: "openstreetmap_nominatim", placeId: "cafe-poi" }, "device");
  assert.equal(gps.venue_name, "User-entered venue", "GPS reverse name is not an explicitly selected venue");
  assert.equal(gps.venue_place_id, null, "GPS must not persist nearby business POI identity");
  assert.equal(gps.venue_provider, "device_geolocation");
  assert.equal(gps.venue_address, "Street address");
  assert.equal(mergeVenueLocation(base, coords, null, "device").venue_name, null,
    "replacing an old POI with GPS must not retain its name");
  console.log("PASS: V8 event form venue selection preserves coherent POI, pin and GPS facts");
} finally {
  await rm(dir, { recursive: true, force: true });
}
