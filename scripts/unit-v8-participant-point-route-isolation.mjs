import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "qiudazi-v8-point-route-"));
try {
  const source = await readFile("src/domain/PointQueueScope.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PointQueueScope.ts",
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const path = join(dir, "PointQueueScope.mjs");
  await writeFile(path, compiled.outputText, "utf8");
  const { advancePointQueueScope: advance, samePointQueueScope: same } = await import(pathToFileURL(path).href);

  const first = { route: "event-A/match-1", generation: 0 };
  assert.equal(advance(first, first.route), first, "same match must preserve queue identity");
  const second = advance(first, "event-B/match-2");
  assert.deepEqual(second, { route: "event-B/match-2", generation: 1 });
  assert.equal(same(second, first), false, "late response from A cannot update B");
  const third = advance(second, first.route);
  assert.equal(same(third, first), false, "A-B-A navigation cannot revive an old A response");
  assert.equal(same(third, third), true);
  assert.equal(advance(third, third.route), third);

  const page = await readFile("src/pages/MatchPage.tsx", "utf8");
  assert.match(page, /pointScope\.current=advancePointQueueScope\(pointScope\.current,routeKey\)/);
  assert.match(page, /pointFlush=useRef<number\|null>\(null\)/);
  assert.match(page, /while\(active\(\)\&\&pointQueue\.current\.length\)/);
  assert.match(page, /catch\(firstError\)\{\s*if\(!active\(\)\)return;\s*const reconciled=await q\.refresh\(\);\s*if\(!active\(\)\)return;/);
  assert.match(page, /if\(!active\(\)\)return;\s*latestSnapshot\.current=next;/);
  assert.match(page, /catch\(e\)\{\s*if\(!active\(\)\)return;\s*setOptimisticPoints/);
  assert.match(page, /if\(pointFlush\.current===scope\.generation\)pointFlush\.current=null/);
  assert.match(page, /q\.data\?\.event\.id===id\?q\.data:null/);
  assert.match(page, /pointQueue\.current=\[\];setOptimisticPoints\(\[\]\);latestSnapshot\.current=null/);
  console.log("PASS: V8 point queue route isolation, A-B-A and stale async guard");
} finally {
  await rm(dir, { recursive: true, force: true });
}
