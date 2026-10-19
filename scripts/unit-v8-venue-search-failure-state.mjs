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
  // A saved POI/pin is already an explicit selection; do not replace its
  // visible label with a reverse-geocoded nearby business on reopening.
  assert.match(ui, /if\(position\)\{if\(!\(initialVenueName\|\|initialAddress\)\)resolveReadablePlace\(position\)\}else/);
  assert.match(ui, /const originalSelection=!!position&&position\.lat===initialLatitude&&position\.lng===initialLongitude/);
  assert.match(ui, /place\?\.name\|\|\(originalSelection\?initialVenueName:""\)/);
  assert.match(ui, /place\?\.address\|\|\(originalSelection\?initialAddress:""\)/);
  assert.match(ui, /\[place,setPlace\]=useState<PickedPlace\|null>\(null\)/);
  assert.match(ui, /collectVenueSearch<VenuePlace>\(/);
  assert.match(ui, /if\(!found\.length&&hadFailure\)/);
  assert.match(ui, /!searching&&!error&&searchCompleted\?<p className="muted small">\{noResultsCopy\}/);
  assert.match(ui, /searchSeq\.current\+\+;setQuery\(value\);setError\(""\);setResults\(\[\]\);setSearchCompleted\(false\)/);
  assert.match(ui, /searchSeq\.current\+\+;setSearching\(false\);setSearchCompleted\(false\);setError\(""\)/);
  // The bounded alias "国家" is useful for recall, but must not surface
  // unrelated national landmarks for an explicit tennis-venue query.
  const parsedUi = ts.createSourceFile("VenueMapPicker.tsx", ui, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const rankingFunctions = new Set(["normalizeText", "coreSearchTerm", "fuzzyCoverage", "broadVenueCategory", "rankPlaces"]);
  const rankingSource = parsedUi.statements
    .filter(node => ts.isFunctionDeclaration(node) && node.name && rankingFunctions.has(node.name.text))
    .map(node => node.getText(parsedUi)).join("\n");
  assert.equal((rankingSource.match(/function /g) || []).length, rankingFunctions.size);
  const rankingCompiled = ts.transpileModule(`${rankingSource}\nexport { rankPlaces };`, {
    fileName: "VenueSearchRanking.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(rankingCompiled.diagnostics?.length ?? 0, 0);
  const rankingPath = join(temp, "VenueSearchRanking.mjs");
  await writeFile(rankingPath, rankingCompiled.outputText, "utf8");
  const { rankPlaces } = await import(pathToFileURL(rankingPath).href);
  const candidate = (name, address = "北京市朝阳区") => ({ name, address, provider: "baidu" });
  const mixed = [candidate("国家大剧院"), candidate("国家体育馆"), candidate("国家网球中心"), candidate("国家博物馆")];
  assert.deepEqual(rankPlaces(mixed, "国家网球").map(item => item.name), ["国家网球中心"],
    "a tennis-specific query must not accept generic national landmarks from relaxed aliases");
  assert.deepEqual(rankPlaces([candidate("奥林匹克森林公园")], "奥森").map(item => item.name), ["奥林匹克森林公园"],
    "non-tennis shorthand still supports relevant fuzzy venue recall");
  assert.deepEqual(rankPlaces([candidate("城市绿心森林公园")], "绿心").map(item => item.name), ["城市绿心森林公园"]);
  assert.deepEqual(rankPlaces([candidate("Tension Club"), candidate("Tennis Center")], "tennis").map(item => item.name), ["Tennis Center"],
    "English tennis queries must not accept near-spelling unrelated POIs");
  // Map movement or GPS selection must cancel a search that is still in flight.
  assert.match(ui, /function invalidateReverseLookup\(\)\{searchSeq\.current\+\+;setSearching\(false\);setResults\(\[\]\);setSearchCompleted\(false\);setSearchOpen\(false\);/);
  assert.match(ui, /map\.on\("dragstart",\(\)=>\{dragged\.current=true;locationSeq\.current\+\+;invalidateReverseLookup\(\)/);
  assert.match(ui, /function locate\(\)\{const seq=\+\+locationSeq\.current;invalidateReverseLookup\(\)/);
  console.log("V8 venue search failure/empty/stale-result contract passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
