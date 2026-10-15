import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "src/domain/ParticipantScoringEligibilityGate.ts"), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(transpiled.diagnostics?.length ?? 0, 0);
const gate = await import(`data:text/javascript,${encodeURIComponent(transpiled.outputText)}`);
const base = { eventId: "event-1", matchId: "match-1", eventVersion: 4, matchVersion: 7, authRevision: 2, retryRevision: 0 };
const key = gate.participantEligibilityKey(base);
assert.equal(gate.hasCurrentParticipantEligibility(key, { key, status: "eligible" }), true);
for (const status of ["ineligible", "unavailable"]) {
  assert.equal(gate.hasCurrentParticipantEligibility(key, { key, status }), false);
}
for (const changed of [
  { eventId: "event-2" }, { matchId: "match-2" }, { eventVersion: 5 },
  { matchVersion: 8 }, { authRevision: 3 }, { retryRevision: 1 },
]) {
  assert.equal(gate.hasCurrentParticipantEligibility(gate.participantEligibilityKey({ ...base, ...changed }), { key, status: "eligible" }), false);
}
assert.equal(gate.hasCurrentParticipantEligibility(key, null), false);
assert.equal(gate.parseParticipantEligibility({ eligible: true }), true);
assert.equal(gate.parseParticipantEligibility({ eligible: false }), false);
for (const malformed of [null, undefined, true, [], {}, { eligible: "true" }, { eligible: 1 }, { eligible: true, actor_id: "spoof" }, { error: "SERVICE_UNAVAILABLE" }]) {
  assert.equal(gate.parseParticipantEligibility(malformed), null);
}

const hook = readFileSync(resolve(root, "src/hooks/useParticipantScoringEligibility.ts"), "utf8");
const hookResult = ts.transpileModule(hook, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  reportDiagnostics: true,
});
assert.equal(hookResult.diagnostics?.length ?? 0, 0);
assert.match(hook, /functions\.invoke\("participant-scoring-eligibility"/);
assert.match(hook, /body: \{ event_id: eventId, match_id: matchId \}/);
assert.match(hook, /onAuthStateChange/);
assert.match(hook, /return \(\) => \{ active = false; \}/);
assert.doesNotMatch(hook, /body: \{[^}]*actor_id|body: \{[^}]*profile_id/);
console.log("V8 participant scoring eligibility client gate: PASS");
