import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile("src/pages/MatchPage.tsx", "utf8");
const jsx = source.split("\n").find((line) => line.trimStart().startsWith("return <><Header"));
assert.ok(jsx, "match UI JSX return must exist");
const transpiled = ts.transpileModule(`function MatchUI() {\n${jsx}\n`, {
  fileName: "MatchPage.tsx",
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
});
assert.equal(transpiled.diagnostics?.length ?? 0, 0, "Match UI must transpile");
assert.match(source, /useParticipantScoringEligibility\(\{/);
assert.match(source, /s\.viewer_role!=="owner"&&mode!=="direct"/);
assert.match(source, /s\.event\.format==="round_robin"&&m\.stage==="round_robin"/);
assert.match(source, /const canPoint=\(canScore\|\|participantEligibility\.eligible\)/);
assert.match(source, /if\(!current\|\|!currentMatch\|\|!canPoint\|\|busy/);
assert.equal((source.match(/disabled=\{!canPoint\|\|busy\|\|!!live\.winner/g) || []).length, 2);
assert.match(source, /mode==="detail"&&!owner&&canPoint&&<div className="stack">/);
assert.match(source, /to=\{base\+"\/live"\}/);
assert.match(source, /participantEligibility\.checking/);
assert.match(source, /participantEligibility\.unavailable/);
assert.match(source, /onClick=\{participantEligibility\.refresh\}/);
assert.match(source, /disabled=\{!canScore\|\|busy\|\|optimisticPoints\.length>0/,
  "undo must remain organizer-only");
assert.match(source, /disabled=\{!canScore\|\|busy\|\|!!validation/,
  "direct result entry must remain organizer-only");
assert.match(source, /mode==="detail"&&canScore&&<div className="stack">/,
  "organizer correction flow must remain available");
console.log("PASS: V8 participant Match UI eligibility-gated point entry contract");

// A fresh polling snapshot may include an operation before the Edge response
// reaches the client. Display and next-point prediction must not add it again.
assert.match(source, /uncommittedPointQueue\(pointQueue\.current,current\.point_logs,currentMatch\.id\)/);
assert.match(source, /uncommittedPointQueue\(optimisticPoints,s\.point_logs,m\.id\)/);
const helperSource = await readFile("src/domain/PointQueueReconciliation.ts", "utf8");
const helperCompiled = ts.transpileModule(helperSource, {
  fileName: "PointQueueReconciliation.ts",
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
assert.equal(helperCompiled.diagnostics?.length ?? 0, 0);
const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");
const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-point-polling-"));
try {
  const helperPath = join(tmp, "PointQueueReconciliation.mjs");
  await writeFile(helperPath, helperCompiled.outputText, "utf8");
  const { uncommittedPointQueue } = await import(pathToFileURL(helperPath).href);
  const queue = [
    { operationId: "op-committed", side: "A" },
    { operationId: "op-pending", side: "B" },
  ];
  const logs = [{ id: "op-committed", match_id: "match-1", voided_at: null }];
  assert.deepEqual(uncommittedPointQueue(queue, logs, "match-1"), [queue[1]],
    "a point visible through polling must not be applied twice");
  assert.deepEqual(uncommittedPointQueue(queue, logs, "match-2"), queue,
    "other-match point logs must not hide this match's pending points");
  assert.deepEqual(uncommittedPointQueue(queue, [{ ...logs[0], voided_at: "2026-10-19" }], "match-1"), [queue[1]],
    "an already committed operation must not be replayed optimistically after undo");
  assert.deepEqual(uncommittedPointQueue(queue, [], "match-1"), queue,
    "uncommitted points remain optimistic");
  assert.equal(queue.length, 2, "reconciliation must not consume the retry queue");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
console.log("PASS: V8 polling/optimistic point reconciliation prevents duplicate display");
