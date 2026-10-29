import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-admin-score-deeplink-"));
try {
  const domain = await readFile("src/domain/PlatformAdminScoreExceptionLookup.ts", "utf8");
  const compiled = ts.transpileModule(domain, {
    fileName: "PlatformAdminScoreExceptionLookup.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const path = join(tmp, "score-deeplink.mjs");
  await writeFile(path, compiled.outputText, "utf8");
  const { scoreExceptionEventFromSearch: fromSearch } = await import(pathToFileURL(path).href);
  const eventId = "a1111111-1111-4111-8111-111111111111";
  assert.equal(fromSearch(`?score_event=${eventId}`), eventId);
  assert.equal(fromSearch(`?score_event=${eventId.toUpperCase()}&unused=1`), eventId);
  for (const search of ["", "?score_event=", "?score_event=not-an-id", "?score_event=../../events",
    "?score_event=javascript%3Aalert(1)", "?score_event=11111111-1111-1111-1111-11111111111X"]) {
    assert.equal(fromSearch(search), null, `Invalid query must not trigger an Edge lookup: ${search}`);
  }
  const directory = await readFile("src/components/PlatformAdminEventDirectory.tsx", "utf8");
  const lookup = await readFile("src/components/PlatformAdminScoreExceptionLookup.tsx", "utf8");
  for (const [filename, source] of [["PlatformAdminEventDirectory.tsx", directory],
    ["PlatformAdminScoreExceptionLookup.tsx", lookup]]) {
    const parsed = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    });
    assert.equal(parsed.diagnostics?.length ?? 0, 0);
  }
  assert.match(directory, /score_event=\$\{encodeURIComponent\(item\.id\)\}/);
  assert.match(directory, /#platform-admin-score-exceptions/);
  assert.match(lookup, /scoreExceptionEventFromSearch\(location\.search\)/);
  assert.match(lookup, /setSelected\(normalized\)/);
  assert.match(lookup, /id="platform-admin-score-exceptions"/);
  assert.match(lookup, /location\.key/);
  assert.doesNotMatch(lookup, /\.(insert|update|delete|upsert|from)\(/);
  console.log("V8 admin event-to-score-exception deep-link contract passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
