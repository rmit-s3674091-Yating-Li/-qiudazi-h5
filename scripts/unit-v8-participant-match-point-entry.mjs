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
