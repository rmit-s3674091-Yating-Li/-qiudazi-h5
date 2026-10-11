import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const source = fs.readFileSync("src/domain/QuickGroupConfig.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(module,exports){${js}\n})(module,module.exports)`, { module });
const { maxQuickGroupCount, isValidQuickGroupConfig } = module.exports;

assert.equal(maxQuickGroupCount(3), 0);
assert.equal(maxQuickGroupCount(4), 2);
assert.equal(maxQuickGroupCount(7), 3);
assert.equal(maxQuickGroupCount(54), 26);
assert.equal(maxQuickGroupCount(4.5), 0);

for (const [entries, groups, qualifiers, expected] of [
  [4, 2, 1, true],
  [4, 1, 1, false],
  [4, 2, 2, false],
  [5, 2, 1, true],
  [6, 3, 1, true],
  [6, 2, 2, true],
  [6, 2, 3, false],
  [7, 3, 1, true],
  [8, 3, 1, true],
  [8, 3, 2, false],
  [8, 2, 3, true],
  [3, 2, 1, false],
  [4, 2, 1.5, false],
  [8, 0, 1, false],
  [52, 26, 1, true],
  [54, 27, 1, false],
]) {
  assert.equal(
    isValidQuickGroupConfig(entries, groups, qualifiers),
    expected,
    `entries=${entries} groups=${groups} qualifiers=${qualifiers}`,
  );
}
console.log("V8 quick group config bounds passed");
