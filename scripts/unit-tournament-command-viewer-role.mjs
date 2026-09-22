import fs from "node:fs";
const edge=fs.readFileSync("supabase/functions/tournament-command/index.ts","utf8");
const match=fs.readFileSync("src/pages/MatchPage.tsx","utf8");
const expect=(v,m)=>{if(!v)throw new Error(m);};
expect(edge.includes('rpc("get_event_snapshot_for_actor"'),"tournament command must load actor-aware owner snapshot");
expect(edge.includes("p_actor_auth_user_id: user.id"),"actor-aware snapshot must use authenticated user id");
expect(!edge.includes('rpc("get_event_snapshot", { p_event_id: cmd.event_id })'),"service-role generic snapshot must not drive owner command response");
expect(match.includes('const e=s.event,owner=s.viewer_role==="owner",canScore=owner&&e.status==="ongoing"'),"match scoring permission must remain owner-driven");
console.log("Tournament command viewer-role regression tests passed");
