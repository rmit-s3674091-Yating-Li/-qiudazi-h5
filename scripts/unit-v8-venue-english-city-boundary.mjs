import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-venue-city-"));
try {
  const source = await readFile("src/domain/VenueCitySearch.ts", "utf8");
  const output = ts.transpileModule(source, {
    fileName: "VenueCitySearch.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics?.length ?? 0, 0);
  const modulePath = join(tmp, "VenueCitySearch.mjs");
  await writeFile(modulePath, output.outputText, "utf8");
  const { resolveVenueCityBounds, isWithinVenueCityBounds } = await import(pathToFileURL(modulePath).href);
  const beijing = { name: "北京市", address: "北京市，中国", latitude: 39.9, longitude: 116.4,
    boundingBox: [39.4, 41.1, 115.4, 117.6], provider: "openstreetmap_nominatim", placeId: "beijing" };
  const shanghai = { name: "上海市", address: "上海市，中国", latitude: 31.2, longitude: 121.5,
    boundingBox: [30.6, 31.9, 120.8, 122.1], provider: "openstreetmap_nominatim", placeId: "shanghai" };
  const cityLookup = async () => [shanghai, beijing];
  assert.deepEqual(await resolveVenueCityBounds("北京", cityLookup), beijing.boundingBox);
  assert.deepEqual(await resolveVenueCityBounds("Beijing", cityLookup), beijing.boundingBox);
  assert.deepEqual(await resolveVenueCityBounds("上海市", cityLookup), shanghai.boundingBox);
  assert.equal(isWithinVenueCityBounds({ latitude: 39.95, longitude: 116.4 }, beijing.boundingBox), true);
  assert.equal(isWithinVenueCityBounds({ latitude: 31.2, longitude: 121.5 }, beijing.boundingBox), false);
  assert.equal(isWithinVenueCityBounds({ latitude: NaN, longitude: 116.4 }, beijing.boundingBox), false);
  await assert.rejects(resolveVenueCityBounds("成都", cityLookup), /VENUE_CITY_BOUNDARY_UNAVAILABLE/);
  await assert.rejects(resolveVenueCityBounds("北京", async () => [{ ...beijing, boundingBox: [18, 54, 73, 135] }]), /VENUE_CITY_BOUNDARY_UNAVAILABLE/);
  const picker = await readFile("src/components/VenueMapPicker.tsx", "utf8");
  assert.match(picker, /resolveVenueCityBounds\(city,/);
  assert.match(picker, /viewbox:bounds,bounded:true/);
  assert.match(picker, /isWithinVenueCityBounds\(item,bounds\)/);
  assert.doesNotMatch(picker, /variant=>en\?browserMapProvider\.searchPlaces\(variant,\{language:"en"\}\)/);
  console.log("V8 English venue city-boundary fail-closed contract passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
