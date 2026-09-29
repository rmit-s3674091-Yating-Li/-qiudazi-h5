import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const state=JSON.parse(read("docs/CURRENT_STATE.json"));
const governance=read("docs/DOCUMENT_GOVERNANCE.md");
const workboard=read("docs/V7_WORKBOARD.md");
const readme=read("README.md");
const assert=(v,m)=>{if(!v)throw new Error(m);};

assert(state.schema_version===2,"CURRENT_STATE schema_version must be 2");
assert(state.precedence?.product_rule?.[0]==="topic_owner_canonical","Product rule precedence must start with topic owner canonical");
assert(state.precedence?.implementation?.[0]==="docs/V7_WORKBOARD.md","Implementation precedence must point to Workboard");
assert(state.precedence?.verification?.[0]==="verification_ledger","Verification precedence must start with verification ledger");
assert(state.precedence?.runtime?.[0]==="runtime_exact_head","Runtime precedence must start with exact head");
assert(governance.includes("Rule Owner Registry + Change Impact Manifest"),"DOCUMENT_GOVERNANCE must define Rule Owner / Change Impact rules");
assert(governance.includes("Product truth / Implementation truth / Verification truth / Runtime truth"),"DOCUMENT_GOVERNANCE must separate truth domains");
assert(governance.includes("docs/CURRENT_STATE.json"),"DOCUMENT_GOVERNANCE must reference CURRENT_STATE");
assert(workboard.includes("Implementation only"),"Workboard must declare implementation-only state machine");
assert(workboard.includes("verification ledger"),"Workboard must declare ledger boundary");
assert(readme.includes("docs/CURRENT_STATE.json"),"README read-chain must include CURRENT_STATE");

const allowed=new Set(state.implementation_states||[]);
assert(["TODO","IN_PROGRESS","IMPLEMENTED","BLOCKED"].every(v=>allowed.has(v))&&allowed.size===4,"Implementation state set must be exactly TODO/IN_PROGRESS/IMPLEMENTED/BLOCKED");

const rows=workboard.split("\n").filter(line=>/^\| V7-/.test(line));
for(const row of rows){
  const cells=row.split("|").map(x=>x.trim());
  const id=cells[1];
  const currentState=cells[4];
  assert(allowed.has(currentState),`Workboard row ${id} has forbidden implementation state: ${currentState}`);
}

for(const [topic,cfg] of Object.entries(state.topic_owners||{})){
  assert(cfg.owner,`Missing owner declaration for ${topic}`);
  assert(fs.existsSync(path.join(root,cfg.owner)),`Missing owner for ${topic}: ${cfg.owner}`);
  for(const p of cfg.supporting||[])assert(fs.existsSync(path.join(root,p)),`Missing supporting doc for ${topic}: ${p}`);
  for(const id of cfg.workboard_ids||[])assert(workboard.includes(`| ${id} |`),`Missing Workboard row for ${topic}: ${id}`);
}

for(const change of state.active_changes||[]){
  assert(change.change_id&&change.topic&&change.implementation_state,`Every active change needs id/topic/implementation_state`);
  assert(allowed.has(change.implementation_state),`Active change ${change.change_id} has invalid implementation_state`);
  assert(change.verification_impact,`Active change ${change.change_id} must state verification impact`);
  assert(state.topic_owners?.[change.topic],`No topic owner for active change ${change.change_id}`);
  const scope=(change.marker_scope||[]).map(p=>read(p)).join("\n");
  for(const marker of change.required_markers||[])assert(scope.includes(marker),`Required current-rule marker missing for ${change.change_id}: ${marker}`);
  for(const marker of change.forbidden_markers||[])assert(!scope.includes(marker),`Superseded rule marker still present for ${change.change_id}: ${marker}`);
}

assert(Array.isArray(state.automation_read_chain)&&state.automation_read_chain[0]==="docs/DOCUMENT_GOVERNANCE.md","Automation read-chain must start with DOCUMENT_GOVERNANCE");
assert(state.automation_read_chain.includes("PR_24_verification_ledger"),"Automation read-chain must include verification ledger");
assert(state.automation_prompt_policy?.includes("Do not hard-code current product details"),"Automation prompt policy must prohibit hard-coded product facts");

console.log("Document governance drift contract passed");
