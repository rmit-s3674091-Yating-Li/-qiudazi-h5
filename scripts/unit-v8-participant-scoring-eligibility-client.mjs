import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
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

async function exerciseSessionRace(initialSession, currentSession) {
  const states = [];
  let stateCursor = 0;
  let effects = [];
  let sessionReads = 0;
  const requests = [];
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: sessionReads++ === 0 ? initialSession : currentSession }, error: null,
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    functions: {
      invoke: async (name, options) => {
        requests.push({ name, options });
        return { data: { eligible: true }, error: null };
      },
    },
  };
  const react = {
    useState(initial) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (next) => {
        states[index] = typeof next === "function" ? next(states[index]) : next;
      }];
    },
    useCallback(callback) { return callback; },
    useEffect(callback) { effects.push(callback); },
  };
  const compiledHook = ts.transpileModule(hook, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiledHook.diagnostics?.length ?? 0, 0);
  const module = { exports: {} };
  runInNewContext(compiledHook.outputText, {
    module,
    exports: module.exports,
    require(name) {
      if (name === "react") return react;
      if (name === "../repositories/supabase") return { supabase: client };
      if (name === "../domain/ParticipantScoringEligibilityGate") return gate;
      throw new Error(`Unexpected hook dependency: ${name}`);
    },
  });
  const props = { eventId: "event-1", matchId: "match-1", eventVersion: 4, matchVersion: 7, enabled: true };
  const render = () => {
    stateCursor = 0;
    effects = [];
    return module.exports.useParticipantScoringEligibility(props);
  };
  render();
  for (const effect of effects) effect();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { result: render(), requests, sessionReads };
}
const actorA = { user: { id: "actor-A" }, access_token: "token-A" };
const actorB = { user: { id: "actor-B" }, access_token: "token-B" };
const sameActor = await exerciseSessionRace(actorA, actorA);
assert.equal(sameActor.result.eligible, true);
assert.equal(sameActor.result.checking, false);
assert.equal(sameActor.requests.length, 1);
assert.equal(sameActor.requests[0].name, "participant-scoring-eligibility");
assert.equal(sameActor.requests[0].options.headers.Authorization, "Bearer token-A");
assert.equal(sameActor.sessionReads, 2);
const switched = await exerciseSessionRace(actorA, actorB);
assert.equal(switched.result.eligible, false, "a switched account must not inherit a positive preflight");
assert.equal(switched.result.checking, false);
assert.equal(switched.requests[0].options.headers.Authorization, "Bearer token-A");
const signedOut = await exerciseSessionRace(actorA, null);
assert.equal(signedOut.result.eligible, false);
assert.equal(signedOut.result.checking, false);
const missing = await exerciseSessionRace(null, null);
assert.equal(missing.result.eligible, false);
assert.equal(missing.requests.length, 0);
const missingActor = await exerciseSessionRace({ access_token: "token-A" }, null);
assert.equal(missingActor.result.eligible, false);
assert.equal(missingActor.requests.length, 0);
console.log("V8 participant scoring eligibility client gate and JWT/session race: PASS");
