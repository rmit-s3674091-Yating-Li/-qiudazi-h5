import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const state=JSON.parse(read("docs/CURRENT_STATE.json"));
const governance=read("docs/DOCUMENT_GOVERNANCE.md");
const workboard=read("docs/V7_WORKBOARD.md");
const readme=read("README.md");
const changelog=read("CHANGELOG.md");
const release=read("docs/RELEASE_GOVERNANCE.md");
const assert=(v,m)=>{if(!v)throw new Error(m);};

assert(state.schema_version===4,"CURRENT_STATE schema_version must be 4");
assert(state.precedence?.product_rule?.[0]==="topic_owner_canonical","Product precedence must start with topic owner");
assert(state.precedence?.implementation?.[0]==="docs/V7_WORKBOARD.md","Implementation precedence must point to Workboard");
assert(state.precedence?.verification?.[0]==="verification_ledger","Verification precedence must start with ledger");
assert(state.precedence?.runtime?.[0]==="runtime_exact_head","Runtime precedence must start with exact head");
assert(governance.includes("Verification ledger contract"),"Governance must define ledger contract");
assert(governance.includes("<!-- v7-controller-status -->"),"Controller marker contract must be documented");
assert(state.controller?.authoritative_source?.includes("<!-- v7-controller-status -->"),"Controller authoritative source must be registered");
assert(Array.isArray(state.controller?.end_of_cycle_reconciliation)&&state.controller.end_of_cycle_reconciliation.length>=8,"Controller reconciliation contract must be explicit");
assert((state.verification?.evidence_layers||[]).includes("PREVIEW_BROWSER")&&(state.verification?.evidence_layers||[]).includes("REAL_DEVICE"),"Verification evidence layers must distinguish Browser and real device");
assert(governance.includes("ACTIVE / VERIFYING / CLOSED"),"Governance must define change lifecycle");
assert(release.includes("V7 Change Manifest / Verification Ledger integration"),"Release governance must consume manifest + ledger");

const allowed=new Set(state.implementation_states||[]);
assert(["TODO","IN_PROGRESS","IMPLEMENTED","BLOCKED"].every(v=>allowed.has(v))&&allowed.size===4,"Implementation states must be exactly four");
const verificationTokens=/\b(VERIFIED|NEEDS_VERIFY|BROWSER_PENDING|CODE_REOPEN|REOPENED|SUPERSEDED|INFRA_BLOCKED|EXTERNAL_BLOCKED)\b/;

const rows=workboard.split("\n").filter(line=>/^\| V7-/.test(line));
for(const row of rows){
  const cells=row.split("|").map(x=>x.trim());
  const id=cells[1], currentState=cells[4], evidence=cells[5]||"", next=cells[6]||"";
  assert(allowed.has(currentState),`Workboard row ${id} has forbidden implementation state: ${currentState}`);
  assert(!verificationTokens.test(evidence),`Workboard row ${id} evidence carries verification-state token`);
  verificationTokens.lastIndex=0;
  assert(!verificationTokens.test(next),`Workboard row ${id} next-action carries verification-state token`);
  verificationTokens.lastIndex=0;
}

const requiredTopics=new Set(state.required_topics||[]);
assert(requiredTopics.size>0,"required_topics must not be empty");
for(const topic of requiredTopics){
  const cfg=state.topic_owners?.[topic];
  assert(cfg?.owner,`Missing owner for required topic ${topic}`);
  assert(fs.existsSync(path.join(root,cfg.owner)),`Missing owner file for ${topic}: ${cfg.owner}`);
  for(const p of cfg.supporting||[])assert(fs.existsSync(path.join(root,p)),`Missing supporting doc for ${topic}: ${p}`);
  for(const id of cfg.workboard_ids||[])assert(workboard.includes(`| ${id} |`),`Missing Workboard row for ${topic}: ${id}`);
}

const lifecycle=new Set(state.change_lifecycle_states||[]);
assert(["ACTIVE","VERIFYING","CLOSED"].every(v=>lifecycle.has(v))&&lifecycle.size===3,"Change lifecycle must be ACTIVE/VERIFYING/CLOSED");
const activeAutomationNames=new Set((state.automation_topology?.active||[]).map(x=>x.short_name));
for(const change of state.active_changes||[]){
  assert(change.change_id&&change.topic&&change.implementation_state&&change.lifecycle_state,`Active change missing required fields`);
  assert(state.topic_owners?.[change.topic],`No owner for active change ${change.change_id}`);
  assert(lifecycle.has(change.lifecycle_state)&&change.lifecycle_state!=="CLOSED",`active_changes cannot contain CLOSED: ${change.change_id}`);
  assert(change.close_rule,`Active change ${change.change_id} lacks close_rule`);
  for(const a of change.affected_automations||[])assert(activeAutomationNames.has(a),`Inactive automation listed for ${change.change_id}: ${a}`);
  const scope=(change.marker_scope||[]).map(read).join("\n");
  for(const marker of change.required_markers||[])assert(scope.includes(marker),`Required marker missing for ${change.change_id}: ${marker}`);
  for(const marker of change.forbidden_markers||[])assert(!scope.includes(marker),`Forbidden marker remains for ${change.change_id}: ${marker}`);
  assert(changelog.includes(change.change_id),`CHANGELOG missing change_id ${change.change_id}`);
}
for(const change of state.closed_changes||[])assert(change.lifecycle_state==="CLOSED","closed_changes may contain CLOSED only");

assert(state.verification?.ledger_schema_version===2,"Ledger schema contract must be v2");
for(const f of state.verification?.required_fields||[])assert(["reviewed_exact_head","reviewed_at","checked_scope","scope_verdicts"].includes(f),`Unknown ledger required field: ${f}`);
assert(Array.isArray(state.drift_detection?.repository_checks),"Repository checks must be explicit");
assert(Array.isArray(state.drift_detection?.runtime_checks),"Runtime checks must be explicit");
assert(state.drift_detection.runtime_checks.includes("ledger_reviewed_exact_head_freshness"),"Runtime checks must include ledger freshness");
assert(state.drift_detection.runtime_checks.includes("actual_automation_topology"),"Runtime checks must include automation topology");
assert(Array.isArray(state.automation_read_chain)&&state.automation_read_chain[0]==="docs/DOCUMENT_GOVERNANCE.md","Automation read chain must start with governance");
assert(readme.includes("docs/CURRENT_STATE.json"),"README read-chain must include CURRENT_STATE");

console.log("Document governance drift contract passed");
