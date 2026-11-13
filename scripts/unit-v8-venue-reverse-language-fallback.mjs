import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual nested picker callback with fake providers. Chinese UI
// may use OSM after Baidu failure, while retaining user-entered venue details.
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
  let suggestion = "";
  const context = {
    lookupTimer: { current: null }, lookupSeq: { current: 0 },
    setResolving: () => {},
    window: { setTimeout: (fn) => { timers.push(fn); return 1; }, clearTimeout: () => {} },
    en: english, initialCity: "北京", initialVenueName: "手填场馆", initialAddress: "手填地址", language: english ? "en" : "zh",
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
    setReverseAddressSuggestion: (address) => { suggestion = address; },
    setPlace: (place) => { selected = typeof place === "function" ? place(null) : place; },
  };
  vm.runInNewContext(compiled.outputText, context);
  context.resolveReadablePlace({ lat: 39.99, lng: 116.39 });
  assert.equal(timers.length, 1);
  timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(baiduCalls, english ? 0 : 1, "Chinese lookup uses Baidu; English lookup does not");
  assert.equal(globalCalls, expectedGlobalCalls, "OSM fallback call count");
  assert.equal(selected, "not-called", "reverse lookup must not replace selected venue");
  assert.equal(suggestion, expectedGlobalCalls ? "English address" : baiduResult.address);
}

await check({ english: false, baiduResult: new Error("Baidu unavailable"), expectedGlobalCalls: 1, expectedPlace: { name: "手填场馆", address: "手填地址", provider: "manual_pin", placeId: null } });
await check({ english: false, baiduResult: null, expectedGlobalCalls: 1, expectedPlace: { name: "手填场馆", address: "手填地址", provider: "manual_pin", placeId: null } });
await check({ english: false, baiduResult: { name: "国家网球中心", address: "北京市朝阳区", provider: "baidu" },
  expectedGlobalCalls: 0, expectedPlace: { name: "手填场馆", address: "手填地址", provider: "manual_pin", placeId: null } });
await check({ english: true, baiduResult: null, expectedGlobalCalls: 1,
  expectedPlace: { name: "手填场馆", address: "手填地址", provider: "manual_pin", placeId: null } });
console.log("PASS: V8 reverse fallback retains user-entered venue facts and manual-pin identity");
