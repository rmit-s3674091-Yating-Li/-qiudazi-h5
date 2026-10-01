import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const source=fs.readFileSync("src/domain/QuickLifecycle.ts","utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(`(function(module,exports){${js}\n})(module,module.exports)`,{module});
const {quickLifecycleAction,quickWithdrawalOutcome,canUseOrdinaryQuickWithdrawal,quickStartedExitResult}=module.exports;

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

// Started Quick lifecycle is result semantics, never roster deletion.
assert.equal(quickStartedExitResult({eventStatus:"ongoing",matchStatus:"not_started"}),"walkover");
assert.equal(quickStartedExitResult({eventStatus:"ongoing",matchStatus:"ongoing"}),"retirement");
assert.equal(quickStartedExitResult({eventStatus:"ongoing",matchStatus:"finished"}),"none");
assert.equal(quickStartedExitResult({eventStatus:"locked",matchStatus:"not_started"}),"none");
assert.equal(quickStartedExitResult({eventStatus:"cancelled",matchStatus:"ongoing"}),"none");

const service=fs.readFileSync("src/application/TournamentService.ts","utf8");
const edge=fs.readFileSync("supabase/functions/tournament-command/index.ts","utf8");
assert.match(edge,/"cancel"/,"Edge command schema must accept cancel");
assert.match(edge,/"withdraw"/,"Edge command schema must accept participant withdraw");
assert.match(edge,/"exit"/,"Edge command schema must accept started participant exit");
assert.match(edge,/cmd\.type\s*===\s*"exit"[\s\S]*!cmd\.match_id\s*\|\|\s*!cmd\.match_version/,"Exit schema must require match_id and match_version");
assert.match(edge,/cmd\.type\s*===\s*"exit"[\s\S]*!cmd\.confirmed[\s\S]*CONFIRM_REQUIRED/,"Started exit must require explicit confirmation");
assert.match(edge,/cmd\.type\s*===\s*"exit"[\s\S]*client\.rpc\("resolve_quick_match_exit"[\s\S]*p_match_id:\s*cmd\.match_id[\s\S]*p_expected_match_version:\s*cmd\.match_version/,"Edge exit must route match identity/version to authoritative resolve_quick_match_exit RPC");
for (const code of ["MATCH_NOT_FOUND","NOT_MATCH_PARTICIPANT","MATCH_EXIT_CLOSED","MATCH_ALREADY_FINISHED","MATCH_EXIT_INVALID","DOWNSTREAM_MATCH_STARTED"]) {
  assert.match(edge,new RegExp(code),`Edge exit must map ${code}`);
}
assert.match(service,/command\.type===?"cancel"|command\.type\s*===\s*"cancel"/,"TournamentService must handle cancel");
assert.match(service,/command\.type===?"withdraw"|command\.type\s*===\s*"withdraw"/,"TournamentService must handle withdraw");
assert.match(service,/e\.status===?"signup"\|\|e\.status===?"locked"|e\.status\s*===\s*"signup"\s*\|\|\s*e\.status\s*===\s*"locked"/,"Lifecycle commands must be pre-start only");
assert.match(service,/CONFIRM_CANCEL/,"Cancel must require explicit confirmation");
assert.match(service,/CONFIRM_WITHDRAW/,"Withdraw must require explicit confirmation");
assert.match(service,/signup_user_id===actorId/,"Legacy in-memory withdraw path must still scope its entry to the actor");
assert.match(service,/entry\.status="withdrawn"/,"Withdraw must preserve the entry as withdrawn history");
assert.match(service,/remaining<2/,"Too few confirmed entries must terminate the Quick event");
assert.match(service,/s\.matches=\[\];s\.set_scores=\[\];s\.point_logs=\[\]/,"Pre-start withdrawal must invalidate stale draw artifacts atomically");
assert.match(service,/e\.draw_generated=false/,"Pre-start withdrawal must clear draw-generated state");
assert.match(service,/e\.status="cancelled"/,"Cancel or minimum-participant termination must enter cancelled terminal state");
assert.match(service,/e\.cancelled_at=c\.now\(\)/,"Cancellation must persist authoritative cancellation time");
assert.match(service,/EVENT_CANCELLED/,"Cancelled events must reject later tournament mutations");

// Unique legal draw UX: two confirmed Entries have exactly one pairing, so the
// Event page must not offer a destructive no-op regenerate action. 3+ Entries
// retain the regenerate control for alternative legal arrangements.
const eventPage=fs.readFileSync("src/pages/EventPage.tsx","utf8");
assert.match(eventPage,/active\.length>2&&<button className="text-button"[\s\S]*重新生成对阵/,
  "Regenerate draw must be guarded by more than two confirmed Entries");

// Regression guard for the DB-level started-exit FAILED_REOPEN: event completion must
// happen in the same authoritative RPC transaction, and only after every real match
// is finished. Executable DB behavior remains Integration evidence.
const finishMigration=fs.readFileSync("supabase/migrations/20260904161500_finish_quick_event_after_match_exit.sql","utf8");
assert.match(finishMigration,/coalesce\(x\.is_bye,false\)=false[\s\S]*x\.status <> 'finished'/,"Event completion must consider every unfinished real match");
assert.match(finishMigration,/set status='finished', finished_at=coalesce\(finished_at,now\(\)\)/,"Final real match must atomically finish the Event with finished_at");
assert.match(finishMigration,/if event_complete then[\s\S]*status='finished'[\s\S]*else[\s\S]*version=version\+1/,"Multi-match Quick must remain ongoing while real matches remain");
console.log("Quick lifecycle unit contract PASS");
  
// Quick one-tap start must actually start play, not stop at locked/draw.
const quickStartPage=fs.readFileSync("src/pages/QuickStartPage.tsx","utf8");
const matchPage=fs.readFileSync("src/pages/MatchPage.tsx","utf8");
assert.match(quickStartPage,/type:"draw"[\s\S]*phase:"start"[\s\S]*type:"start"/,"Quick one-tap start must auto-start after draw");
assert.match(quickStartPage,/real\.length===1[\s\S]*\/matches\//,"Single real Quick match must route directly to Match");
assert.match(quickStartPage,/else navigate\(.*tab=draw/,"Multi-match Quick must route to Draw");
assert.match(quickStartPage,/parsed\.phase==="start"\?"start":"draw"/,"Legacy pending draw state must recover as draw while start phase persists explicitly");
assert.match(matchPage,/m\.status==="not_started"&&e\.event_mode!=="quick"/,"Quick Match must not show redundant mark-started action");
