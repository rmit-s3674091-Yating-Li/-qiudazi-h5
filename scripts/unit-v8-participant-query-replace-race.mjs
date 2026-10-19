import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/hooks/useQuery.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  fileName: "useQuery.ts",
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);

const state = [], refs = [];
let index = 0;
const react = {
  useState(initial) {
    const slot = index++;
    if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
    return [state[slot], (next) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
  },
  useRef(initial) {
    const slot = index++;
    if (!(slot in refs)) refs[slot] = { current: initial };
    return refs[slot];
  },
  useCallback(fn) { return fn; },
  useEffect() { /* Effects are intentionally not run: test the refresh/replace contract. */ },
};
const module = { exports: {} };
runInNewContext(compiled.outputText, {
  module, exports: module.exports,
  require(name) {
    if (name === "react") return react;
    if (name === "../repositories/supabase") return { explainError: (e) => String(e) };
    throw new Error(`Unexpected dependency: ${name}`);
  },
});
const render = (key, load) => { index = 0; return module.exports.useQuery(key, load, 10000); };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

// A polling request started before a confirmed point must never overwrite q.replace.
const old = deferred();
const initial = render("participant-match-1", () => old.promise);
const staleRequest = initial.refresh();
initial.replace({ version: 2, point_logs: ["operation-1"] });
old.resolve({ version: 1, point_logs: [] });
const reconciled = await staleRequest;
assert.equal(reconciled.version, 2, "stale callers should see the newer replaced snapshot");
assert.equal(render("participant-match-1", () => Promise.resolve(null)).data.version, 2,
  "a stale polling response must not overwrite the confirmed point in cache");

// After replace, the next refresh must start a new load rather than join an older request.
const before = deferred();
const first = render("participant-match-2", () => before.promise);
const obsolete = first.refresh();
first.replace({ version: 3 });
const after = deferred();
let freshLoads = 0;
const next = render("participant-match-2", () => { freshLoads++; return after.promise; });
const fresh = next.refresh();
assert.equal(freshLoads, 1, "replace must detach the obsolete in-flight request");
before.resolve({ version: 2 });
await obsolete;
const shared = next.refresh();
assert.equal(freshLoads, 1, "old finally must not remove a newer in-flight request");
after.resolve({ version: 4 });
await Promise.all([fresh, shared]);
assert.equal(render("participant-match-2", () => Promise.resolve(null)).data.version, 4);
console.log("PASS: participant point snapshot replace/polling cache and in-flight race");
