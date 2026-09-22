import fs from "node:fs";
const match=fs.readFileSync("src/pages/MatchPage.tsx","utf8");
const expect=(v,m)=>{if(!v)throw new Error(m);};
expect(match.includes('shouldResyncDirect=mode==="direct"&&!editing'),"unedited direct-score form must resync to latest match version");
expect(match.includes('setFormVersion(m.version)'),"direct-score form must track latest match version");
expect(match.includes('editing&&formVersion!==undefined&&mode==="direct"&&m.version!==formVersion'),"stale warning must require an actively edited form");
expect(match.includes('(editing&&m.version!==formVersion)'),"save must only block on a true edited-form conflict");
console.log("Direct score form-version UX regression tests passed");
