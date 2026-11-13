import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-admin-score-lookup-"));
try {
  const helper = await readFile("src/domain/PlatformAdminScoreExceptionLookup.ts", "utf8");
  const compiled = ts.transpileModule(helper, {
    fileName: "PlatformAdminScoreExceptionLookup.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const helperPath = join(tmp, "lookup.mjs");
  await writeFile(helperPath, compiled.outputText, "utf8");
  const { normalizeScoreExceptionEventId: normalize } = await import(pathToFileURL(helperPath).href);
  const id = "A1111111-1111-4111-8111-111111111111";
  assert.equal(normalize(`  ${id}  `), id.toLowerCase());
  for (const bad of ["", " ", "abc", "a1111111-1111-4111-8111-11111111111", `${id} extra`, `${id}\nother`]) {
    assert.equal(normalize(bad), null);
  }

  const component = await readFile("src/components/PlatformAdminScoreExceptionLookup.tsx", "utf8");
  const page = await readFile("src/pages/PlatformAdminPage.tsx", "utf8");
  const ui = ts.transpileModule(component, {
    fileName: "PlatformAdminScoreExceptionLookup.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal(ui.diagnostics?.length ?? 0, 0);
  const shell = ts.transpileModule(page, {
    fileName: "PlatformAdminPage.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal(shell.diagnostics?.length ?? 0, 0);
  assert.match(page, /zh === "比分与结果异常" \? <PlatformAdminScoreExceptionLookup key=\{userId\}/);
  assert.match(page, /status === "allowed"/);
  assert.match(component, /setSelected\(validId\)/);
  assert.match(component, /setSelected\(null\)/);
  assert.match(component, /selected && <PlatformAdminScoreExceptions/);
  assert.match(component, /key=\{`\$\{userId\}:\$\{selected\}`\}/);
  assert.doesNotMatch(component, /\.(insert|update|delete|upsert|rpc|from)\(/);
  assert.doesNotMatch(component, /functions\.invoke/);
  console.log("PASS V8 admin score exception event lookup and read-only UI contract");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
