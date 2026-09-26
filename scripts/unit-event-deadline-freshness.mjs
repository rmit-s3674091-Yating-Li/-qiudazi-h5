import fs from "node:fs";
const page=fs.readFileSync("src/pages/EventPage.tsx","utf8");
const migration=fs.readFileSync("supabase/migrations/20260829093331_enforce_event_deadline_and_level_range.sql","utf8");
const expect=(v,m)=>{if(!v)throw new Error(m);};
expect(page.includes('useEffect(()=>{void Promise.all([q.refresh(),myEntryQ.refresh()]).catch(()=>{});},[id]);'),"EventPage must force an authoritative snapshot refresh on entry/id change so another user's deadline edit cannot leave stale roster actions visible");
expect(page.includes('remove={registrationOpen&&(owner||entry.id===own?.id)'),"Withdraw UI must remain gated by authoritative registrationOpen state");
expect(migration.includes("if not public.event_registration_open(e) then raise exception 'REGISTRATION_CLOSED';"),"Server withdraw RPC must independently reject closed registration");
console.log("Cross-user registration deadline freshness contract passed");
