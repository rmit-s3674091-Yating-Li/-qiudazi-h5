import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual picker callback with fake providers. Both UI languages
// must use keyless OSM reverse lookup without waiting for a Baidu AK.
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

async function check({ english, reverseResult, expectedSuggestion }) {
  const timers = [];
  let baiduCalls = 0;
  let osmCalls = 0;
  let selected = "not-called";
  let suggestion = "initial";
  let resolving = false;
  const context = {
    lookupTimer: { current: null },
    lookupSeq: { current: 0 },
    setResolving: (value) => { resolving = value; },
    window: { setTimeout: (fn) => { timers.push(fn); return 1; }, clearTimeout: () => {} },
    en: english,
    language: english ? "en" : "zh",
    createConfiguredBaiduMapProvider: () => ({
      reverseGeocode: async () => { baiduCalls++; throw new Error("Baidu must not be called"); },
    }),
    browserMapProvider: {
      reverseGeocode: async () => {
        osmCalls++;
        if (reverseResult instanceof Error) throw reverseResult;
        return reverseResult;
      },
    },
    setReverseAddressSuggestion: (address) => { suggestion = address; },
    setPlace: (place) => { selected = typeof place === "function" ? place(null) : place; },
  };
  vm.runInNewContext(compiled.outputText, context);
  context.resolveReadablePlace({ lat: 39.99, lng: 116.39 });
  assert.equal(timers.length, 1, "reverse lookup is debounced");
  timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(baiduCalls, 0, "automatic reverse lookup must not depend on Baidu");
  assert.equal(osmCalls, 1, "keyless OSM reverse lookup must be attempted");
  assert.equal(selected, "not-called", "reverse lookup must not overwrite venue identity");
  assert.equal(suggestion, expectedSuggestion, "only a suggested address may change");
  assert.equal(resolving, false, "reverse lookup must settle after success or failure");
}

for (const english of [false, true]) {
  await check({
    english,
    reverseResult: { name: "OSM venue", address: "OSM address", provider: "openstreetmap_nominatim" },
    expectedSuggestion: "OSM address",
  });
  await check({
    english,
    reverseResult: new Error("OSM unavailable"),
    expectedSuggestion: "",
  });
  await check({ english, reverseResult: null, expectedSuggestion: "" });
}

// An older network response must never overwrite the newest map position.
{
  const timers = [];
  const pending = [];
  let suggestion = "initial";
  let selected = "not-called";
  const context = {
    lookupTimer: { current: null },
    lookupSeq: { current: 0 },
    setResolving: () => {},
    window: { setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {} },
    language: "zh",
    browserMapProvider: { reverseGeocode: () => new Promise((resolve) => pending.push(resolve)) },
    setReverseAddressSuggestion: (value) => { suggestion = value; },
    setPlace: () => { selected = "called"; },
  };
  vm.runInNewContext(compiled.outputText, context);
  context.resolveReadablePlace({ lat: 39.9, lng: 116.3 });
  timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  context.resolveReadablePlace({ lat: 39.99, lng: 116.39 });
  timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.length, 2);
  pending[1]({ address: "new address" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(suggestion, "new address");
  pending[0]({ address: "stale address" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(suggestion, "new address", "stale response must be ignored");
  assert.equal(selected, "not-called");
}

console.log("PASS: V8 keyless reverse lookup, failure, and stale-response contracts");
