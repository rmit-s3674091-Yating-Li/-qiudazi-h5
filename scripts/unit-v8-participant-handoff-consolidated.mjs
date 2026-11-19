import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const matchPage = await readFile("src/pages/MatchPage.tsx", "utf8");
const conflict = await readFile("src/domain/PointCommandConflict.ts", "utf8");
const eligibility = await readFile("supabase/functions/participant-scoring-eligibility/index.ts", "utf8");
const command = await readFile("supabase/functions/tournament-command/index.ts", "utf8");

assert.match(matchPage, /MatchPageForActor key=\{session\?\.user\.id\?\?"signed-out"\}/,
  "account changes must remount match scoring state");
assert.match(matchPage, /useQuery\("match-"\+id\+"-"\+matchId\+"-"\+\(session\?\.user\.id\?\?"signed-out"\)/,
  "snapshot cache must be account scoped");
assert.match(matchPage, /const finalSnapshot=await q\.refresh\(\)/,
  "failed second replay must reconcile once more");
assert.match(matchPage, /else throw retryError;/,
  "second transient failure must stop automatic retries");
assert.match(conflict, /terminalPointCodes/);
for (const code of ["NOT_MATCH_PARTICIPANT","AUTH_REQUIRED","MATCH_NOT_FOUND","POINT_RETRY_IDENTITY_CONFLICT"]) {
  assert.ok(conflict.includes(`"${code}"`), `${code} must be terminal`);
}
assert.match(eligibility, /body\.event_id\.toLowerCase\(\)/);
assert.match(eligibility, /body\.match_id\.toLowerCase\(\)/);
assert.match(command, /function normalizePointCommandIds/);
assert.match(command, /const cmd = normalizePointCommandIds\(parsed\.data\)/);
assert.match(command, /operation_id: cmd\.operation_id\?\.toLowerCase\(\)/);
console.log("PASS: consolidated V8 participant handoff safety contracts");
await import("./unit-v8-participant-voided-point-reconciliation.mjs");
