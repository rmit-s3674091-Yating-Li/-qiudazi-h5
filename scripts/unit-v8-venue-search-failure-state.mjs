import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temp = await mkdtemp(join(tmpdir(), "qiudazi-v8-venue-search-failure-"));
try {
  const source = await readFile("src/domain/VenueSearchResolution.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "VenueSearchResolution.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const modulePath = join(temp, "VenueSearchResolution.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { collectVenueSearch } = await import(pathToFileURL(modulePath).href);

  const empty = await collectVenueSearch(["奥森"], async () => []);
  assert.deepEqual(empty, { groups: [], hadFailure: false, cancelled: false });

  const allFailed = await collectVenueSearch(["奥森", "奥林匹克森林公园"], async () => { throw Error("BAIDU_PLACE_HTTP_ERROR"); });
  assert.deepEqual(allFailed, { groups: [], hadFailure: true, cancelled: false });

  const partialEmpty = await collectVenueSearch(["奥森", "国家网球"], async term => {
    if (term === "国家网球") throw Error("BAIDU_PLACE_ERROR:302");
    return [];
  });
  assert.deepEqual(partialEmpty, { groups: [], hadFailure: true, cancelled: false });

  const partialResults = await collectVenueSearch(["奥森", "国家网球"], async term => {
    if (term === "国家网球") throw Error("NETWORK_FAILURE");
    return [{ name: "奥森网球中心" }];
  });
  assert.equal(partialResults.groups[0][0].name, "奥森网球中心");
  assert.equal(partialResults.hadFailure, true);

  const malformed = await collectVenueSearch(["奥森"], async () => null);
  assert.equal(malformed.hadFailure, true);
  assert.equal(malformed.groups.length, 0);

  let calls = 0;
  const preCancelled = await collectVenueSearch(["奥森"], async () => { calls++; return []; }, () => false);
  assert.equal(preCancelled.cancelled, true);
  assert.equal(calls, 0);

  let current = true;
  const midCancelled = await collectVenueSearch(["奥森", "国家网球"], async () => {
    calls++;
    current = false;
    return [{ name: "stale" }];
  }, () => current);
  assert.equal(midCancelled.cancelled, true);
  assert.deepEqual(midCancelled.groups, []);
  assert.equal(calls, 1);

  const ui = await readFile("src/components/VenueMapPicker.tsx", "utf8");
  const tsx = ts.transpileModule(ui, {
    fileName: "VenueMapPicker.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal(tsx.diagnostics?.length ?? 0, 0);
  assert.match(ui, /collectVenueSearch<VenuePlace>\(/);
  assert.match(ui, /if\(!found\.length&&hadFailure\)/);
  assert.match(ui, /!searching&&!error&&searchCompleted\?<p className="muted small">\{noResultsCopy\}/);
  assert.match(ui, /searchSeq\.current\+\+;setQuery\(value\);setError\(""\);setResults\(\[\]\);setSearchCompleted\(false\)/);
  assert.match(ui, /searchSeq\.current\+\+;setSearching\(false\);setSearchCompleted\(false\);setError\(""\)/);
  console.log("V8 venue search failure/empty/stale-result contract passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
