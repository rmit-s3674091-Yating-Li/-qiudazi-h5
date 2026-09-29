import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const state=JSON.parse(read("docs/CURRENT_STATE.json"));
const governance=read("docs/DOCUMENT_GOVERNANCE.md");
const workboard=read("docs/V7_WORKBOARD.md");
const readme=read("README.md");
const assert=(v,m)=>{if(!v)throw new Error(m);};

assert(state.schema_version===1,"CURRENT_STATE schema_version must be 1");
assert(state.truth_precedence.includes("verification_ledger"),"CURRENT_STATE must declare verification ledger precedence");
assert(governance.includes("Topic Owner + Current State"),"DOCUMENT_GOVERNANCE must define Topic Owner / Current State rules");
assert(governance.includes("docs/CURRENT_STATE.json"),"DOCUMENT_GOVERNANCE must reference CURRENT_STATE");
assert(workboard.includes("verification ledger"),"Workboard must declare ledger boundary");
assert(readme.includes("docs/CURRENT_STATE.json"),"README read-chain must include CURRENT_STATE");

for(const [topic,cfg] of Object.entries(state.topic_owners)){
  assert(fs.existsSync(path.join(root,cfg.owner)),`Missing owner for ${topic}: ${cfg.owner}`);
  for(const p of cfg.supporting||[])assert(fs.existsSync(path.join(root,p)),`Missing supporting doc for ${topic}: ${p}`);
  for(const id of cfg.workboard_ids||[])assert(workboard.includes(`| ${id} |`),`Missing Workboard row for ${topic}: ${id}`);
}
for(const change of state.active_changes){
  assert(change.change_id&&change.topic&&change.status,"Every active change needs id/topic/status");
  assert(state.topic_owners[change.topic],`No topic owner for active change ${change.change_id}`);
  for(const id of change.invalidates_verification||[]){
    const row=workboard.split("\n").find(line=>line.startsWith(`| ${id} |`))||"";
    assert(row,`Invalidated verification row missing: ${id}`);
    assert(!/\| VERIFIED \|/.test(row),`Invalidated verification still VERIFIED: ${id}`);
  }
}
console.log("Document governance drift contract passed");
