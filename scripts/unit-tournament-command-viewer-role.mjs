import fs from "node:fs";
const edge=fs.readFileSync("supabase/functions/tournament-command/index.ts","utf8");
const match=fs.readFileSync("src/pages/MatchPage.tsx","utf8");
const expect=(v,m)=>{if(!v)throw new Error(m);};
expect(edge.includes('rpc("get_event_snapshot_for_actor"'),"tournament command must load actor-aware owner snapshot");
expect(edge.includes("p_actor_auth_user_id: user.id"),"actor-aware snapshot must use authenticated user id");
expect(!edge.includes('rpc("get_event_snapshot", { p_event_id: cmd.event_id })') || edge.includes("tryParticipantRoundRobinPoint"),"generic snapshot may only be used inside guarded participant point routing");
expect(edge.includes("findPointOperation(client, cmd, user.id)"),"point recovery must preserve authenticated actor context");
expect(edge.includes("tryParticipantRoundRobinPoint(client, cmd, user.id, profile.id)"),"participant point route must use verified actor and profile");
expect(edge.includes('rpc("v8_active_match_participant"'),"participant route must preflight active match membership");
const participantRoute=edge.slice(edge.indexOf("async function tryParticipantRoundRobinPoint"),edge.indexOf("\nDeno.serve("));
const ownerRead=participantRoute.indexOf('.select("owner_user_id")');
const membershipRead=participantRoute.indexOf('rpc("v8_active_match_participant"');
const snapshotRead=participantRoute.indexOf('rpc("get_event_snapshot"');
expect(ownerRead>=0&&ownerRead<membershipRead&&membershipRead<snapshotRead,
  "non-owner membership must be checked before service-role snapshot reads");
expect(participantRoute.includes('if (eventOwner.owner_user_id === actorProfileId) return null;'),
  "organizer must retain the existing owner command route");
expect(participantRoute.match(/rpc\("v8_active_match_participant"/g)?.length===1,
  "participant membership must be checked once for both new operations and replays");
expect(participantRoute.includes('p_actor_auth_user_id: actorAuthUserId'),
  "participant preflight must use the JWT-derived actor, not browser-supplied identity");
expect(edge.includes('rpc("v8_commit_participant_round_robin_point"'),"participant point writes must use dedicated transaction");
expect(!edge.includes("p_actor_auth_user_id: cmd."),"browser command must never choose actor identity");
expect(match.includes('const e=s.event,owner=s.viewer_role==="owner",canScore=owner&&e.status==="ongoing"'),"organizer-only score correction/direct controls must remain owner-driven");
expect(match.includes('const canPoint=(canScore||participantEligibility.eligible)'),"eligible participant point controls must be separately gated");
console.log("Tournament command viewer-role and participant-routing regression tests passed");
