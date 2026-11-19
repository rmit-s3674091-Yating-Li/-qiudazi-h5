import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile("src/components/VenueMapPicker.tsx", "utf8");
const match = source.match(/function invalidateReverseLookup\(\)\{([\s\S]*?)\n  \}/);
assert.ok(match, "reverse lookup invalidation helper must exist");
const compiled = ts.transpileModule(match[0], {
  fileName: "VenueLookupGuard.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "lookup guard must transpile");
const run = new Function("lookupTimer", "lookupSeq", "setResolving", "window", match[1]);
const cleared = [];
const lookupTimer = { current: 42 };
const lookupSeq = { current: 7 };
const resolving = [];
const setResolving = value => resolving.push(value);
const windowStub = { clearTimeout: id => cleared.push(id) };
run(lookupTimer, lookupSeq, setResolving, windowStub);
assert.deepEqual(cleared, [42], "pending reverse debounce must be cancelled");
assert.equal(lookupTimer.current, null, "cancelled timer must not be retained");
assert.equal(lookupSeq.current, 8, "in-flight reverse responses must become stale");
assert.deepEqual(resolving, [false], "selection should not remain stuck resolving");
run(lookupTimer, lookupSeq, setResolving, windowStub);
assert.deepEqual(cleared, [42], "repeated cancellation must be safe");
assert.equal(lookupSeq.current, 9);

assert.match(source, /function applyPlace\([^\n]+\{invalidateReverseLookup\(\);searchSeq\.current\+\+/, "explicit POI selection must invalidate reverse lookup before setting place");
assert.match(source, /map\.on\("dragstart",\(\)=>\{dragged\.current=true;invalidateReverseLookup\(\)\}\)/, "drag start must invalidate old lookup immediately");
assert.match(source, /if\(seq!==lookupSeq\.current\)return;/, "reverse result must be gated by the current epoch");
console.log("V8 venue picker stale reverse lookup guard passed");
