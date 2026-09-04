import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const source=fs.readFileSync("src/domain/QuickLifecycle.ts","utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(`(function(module,exports){${js}\n})(module,module.exports)`,{module});
const {quickLifecycleAction,quickWithdrawalOutcome,canUseOrdinaryQuickWithdrawal}=module.exports;

assert.equal(quickLifecycleAction({status:"signup",viewerRole:"owner",hasStartedMatch:false}),"cancel");
assert.equal(quickLifecycleAction({status:"locked",viewerRole:"owner",hasStartedMatch:false}),"cancel");
assert.equal(quickLifecycleAction({status:"signup",viewerRole:"participant",hasStartedMatch:false}),"withdraw");
assert.equal(quickLifecycleAction({status:"locked",viewerRole:"participant",hasStartedMatch:false}),"withdraw");
assert.equal(quickLifecycleAction({status:"ongoing",viewerRole:"participant",hasStartedMatch:true}),"retire");
assert.equal(quickLifecycleAction({status:"cancelled",viewerRole:"participant",hasStartedMatch:false}),"none");
assert.equal(canUseOrdinaryQuickWithdrawal("ongoing",true),false);
assert.equal(canUseOrdinaryQuickWithdrawal("locked",false),true);
assert.equal(quickWithdrawalOutcome({matchType:"singles",confirmedEntriesAfterWithdrawal:1}),"cancel_event");
assert.equal(quickWithdrawalOutcome({matchType:"singles",confirmedEntriesAfterWithdrawal:2}),"keep_event");
assert.equal(quickWithdrawalOutcome({matchType:"doubles",confirmedEntriesAfterWithdrawal:1}),"cancel_event");
console.log("Quick lifecycle unit contract PASS");
