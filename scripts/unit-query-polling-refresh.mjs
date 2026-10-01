import fs from "node:fs";
const query=fs.readFileSync("src/hooks/useQuery.ts","utf8");
const aud=fs.readFileSync("qa/aud015-doubles-partner-blackbox.mjs","utf8");
const expect=(v,m)=>{if(!v)throw new Error(m);};
expect(query.includes('window.setInterval(()=>{if(!document.hidden)void refresh(true).catch(()=>{});},interval)'),"Explicit polling intervals must force a real refresh instead of re-checking the same stale window");
expect(!query.includes('window.setInterval(()=>{if(!document.hidden)void refresh(false).catch(()=>{});},interval)'),"Polling timer must not be skipped by stale-cache gating");
expect(aud.includes("state: 'detached', timeout: 15000"),"AUD-015 must allow one full 10s polling cycle plus network/render margin");
console.log("Explicit polling refresh contract passed");
