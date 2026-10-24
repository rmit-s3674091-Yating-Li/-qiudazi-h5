import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual nested picker callback with fake providers. Chinese UI
// must not silently fall back to a global address source on Baidu failure.
const source = await readFile("src/components/VenueMapPicker.tsx", "utf8");
const parsed = ts.createSourceFile("VenueMapPicker.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
let resolver;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "resolveReadablePlace") resolver = node;
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(resolver, "the real picker must expose its reverse-lookup callback");
const compiled = ts.transpileModule(`${resolver.getText(parsed)}\nthis.resolveReadablePlace = resolveReadablePlace;`, {
  fileName: "VenueMapPicker.tsx",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "picker reverse callback must transpile");

async function check({ english, baiduResult, expectedGlobalCalls, expectedPlace }) {
  const timers = [];
  let baiduCalls = 0;
  let globalCalls = 0;
  let selected = "not-called";
  const context = {
    lookupTimer: { current: null }, lookupSeq: { current: 0 },
    setResolving: () => {},
    window: { setTimeout: (fn) => { timers.push(fn); return 1; }, clearTimeout: () => {} },
    en: english, initialCity: "北京", language: english ? "en" : "zh",
    createConfiguredBaiduMapProvider: () => ({ reverseGeocode: async () => {
      baiduCalls++;
      if (baiduResult instanceof Error) throw baiduResult;
      return baiduResult;
    } }),
    browserMapProvider: { reverseGeocode: async () => {
      globalCalls++;
      return { name: "English venue", address: "English address", provider: "openstreetmap_nominatim" };
    } },
    reverseLocationHint: (found) => ({ name: "", address: found.address, provider: found.provider, placeId: null }),
    setPlace: (place) => { selected = place; },
  };
  vm.runInNewContext(compiled.outputText, context);
  context.resolveReadablePlace({ lat: 39.99, lng: 116.39 });
  assert.equal(timers.length, 1);
  timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(baiduCalls, english ? 0 : 1, "Chinese lookup uses Baidu; English lookup does not");
  assert.equal(globalCalls, expectedGlobalCalls, "Chinese lookup must not cross-fallback to global OSM");
  assert.deepEqual(JSON.parse(JSON.stringify(selected)), expectedPlace);
}

await check({ english: false, baiduResult: new Error("Baidu unavailable"), expectedGlobalCalls: 0, expectedPlace: null });
await check({ english: false, baiduResult: null, expectedGlobalCalls: 0, expectedPlace: null });
await check({ english: false, baiduResult: { name: "国家网球中心", address: "北京市朝阳区", provider: "baidu" },
  expectedGlobalCalls: 0, expectedPlace: { name: "", address: "北京市朝阳区", provider: "baidu", placeId: null } });
await check({ english: true, baiduResult: null, expectedGlobalCalls: 1,
  expectedPlace: { name: "", address: "English address", provider: "openstreetmap_nominatim", placeId: null } });
console.log("PASS: V8 Chinese reverse source isolation and English fallback contract");
