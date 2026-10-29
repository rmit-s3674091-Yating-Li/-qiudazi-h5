import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Exercise the actual organizer send() body from MatchPage, not a parallel mock implementation.
const source = await readFile("src/pages/MatchPage.tsx", "utf8");
const start = source.indexOf("  async function send(");
const end = source.indexOf("\n  async function flushPointQueue()", start);
assert.ok(start >= 0 && end > start, "organizer send() must be present");
assert.match(source, /useEffect\(\(\)=>\{pointQueue\.current=\[\];setOptimisticPoints\(\[\]\);latestSnapshot\.current=null;setError\(""\);setBusy\(false\);setConfirm\(null\);\},\[routeKey\]\)/,
  "route changes must reset the previous action's busy/confirmation state");
const compiled = ts.transpileModule(source.slice(start, end), {
  fileName: "MatchPage-send.ts",
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "send() must transpile");

function harness() {
  let resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const effects = { busy: [], errors: [], replaced: [], invalidations: 0, confirmations: [], navigations: [] };
  const pointScope = { current: { route: "actor-A/event-1/match-1", generation: 0 } };
  const latestSnapshot = { current: null };
  const ctx = {
    s: { event: { id: "event-1", version: 7 } },
    m: { id: "match-1", version: 3 },
    formVersion: 3,
    pointScope,
    samePointQueueScope: (current, captured) => current.route === captured.route && current.generation === captured.generation,
    setBusy: (value) => effects.busy.push(value),
    setError: (value) => effects.errors.push(value),
    command: async () => pending,
    latestSnapshot,
    q: { replace: (value) => effects.replaced.push(value) },
    invalidateEventReads: () => { effects.invalidations++; },
    setConfirm: (value) => effects.confirmations.push(value),
    navigate: (...args) => effects.navigations.push(args),
    id: "event-1",
    matchId: "match-1",
    explainError: (error) => error.message,
  };
  const make = new Function(...Object.keys(ctx), `${compiled.outputText}\nreturn send;`);
  return { send: make(...Object.values(ctx)), effects, pointScope, latestSnapshot, resolve, reject };
}

// Normal result still updates the match and navigates after a confirmed save.
{
  const h = harness();
  const pending = h.send("score", { scores: [] }, true);
  const snapshot = { event: { id: "event-1", version: 8 } };
  h.resolve(snapshot);
  await pending;
  assert.equal(h.latestSnapshot.current, snapshot);
  assert.deepEqual(h.effects.replaced, [snapshot]);
  assert.equal(h.effects.invalidations, 1);
  assert.equal(h.effects.navigations.length, 1);
  assert.deepEqual(h.effects.busy, [true, false]);
}

// Account switch: old response must not update the new actor's state or navigate away.
{
  const h = harness();
  const pending = h.send("score", {}, true);
  h.pointScope.current = { route: "actor-B/event-1/match-1", generation: 1 };
  h.resolve({ event: { id: "event-1", version: 8 } });
  await pending;
  assert.equal(h.latestSnapshot.current, null);
  assert.equal(h.effects.replaced.length, 0);
  assert.equal(h.effects.invalidations, 0);
  assert.equal(h.effects.confirmations.length, 0);
  assert.equal(h.effects.navigations.length, 0);
  assert.deepEqual(h.effects.busy, [true], "old request cannot clear new route's busy state");
}

// A -> B -> A must not revive the original in-flight response.
{
  const h = harness();
  const pending = h.send("score", {}, true);
  h.pointScope.current = { route: "actor-B/event-1/match-1", generation: 1 };
  h.pointScope.current = { route: "actor-A/event-1/match-1", generation: 2 };
  h.resolve({ event: { id: "event-1", version: 8 } });
  await pending;
  assert.equal(h.effects.replaced.length, 0);
  assert.equal(h.effects.navigations.length, 0);
}

// Stale errors must not overwrite the new route/account's error state.
{
  const h = harness();
  const pending = h.send("undo");
  h.pointScope.current = { route: "actor-B/event-2/match-2", generation: 1 };
  h.reject(new Error("old actor request failed"));
  await pending;
  assert.deepEqual(h.effects.errors, [""], "late old-route errors must be suppressed");
  assert.deepEqual(h.effects.busy, [true]);
}

// Current-route errors still surface normally.
{
  const h = harness();
  const pending = h.send("undo");
  h.reject(new Error("current request failed"));
  await pending;
  assert.deepEqual(h.effects.errors, ["", "current request failed"]);
  assert.deepEqual(h.effects.busy, [true, false]);
}
console.log("PASS: V8 organizer send account/route async response isolation");
