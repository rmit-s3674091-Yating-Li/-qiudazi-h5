import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const audit = await readFile("supabase/functions/platform-admin-audit/index.ts", "utf8");
const photos = await readFile("supabase/functions/platform-admin-photos/index.ts", "utf8");
const events = await readFile("supabase/functions/platform-admin-events/index.ts", "utf8");
const users = await readFile("supabase/functions/platform-admin-users/index.ts", "utf8");
const reports = await readFile("src/domain/PlatformAdminReportDirectory.ts", "utf8");
const reportUi = await readFile("src/components/PlatformAdminReportDirectory.tsx", "utf8");
const venueUi = await readFile("src/components/PlatformAdminVenueCandidateDirectory.tsx", "utf8");

for (const [name, source] of [["audit",audit],["photos",photos],["events",events]]) {
  assert.match(source, /\\d\{1,6\}/, `${name} timestamps must cap PostgreSQL precision at six fractional digits`);
  assert.match(source, /toLowerCase\(\)/, `${name} UUID tie-breaks must be case-insensitive`);
}
assert.match(audit, /sanitizeAuditPage\(data, query\)/, "audit Edge must sanitize the RPC page before serialization");
assert.match(audit, /items\.length !== query\.pageSize/, "audit cursor requires a complete page");
assert.match(photos, /strictlyOlder\(current, previous\)/, "photo pages must be strictly behind their cursor");
assert.match(photos, /seen\.has\(row\.id\.toLowerCase\(\)\)/, "photo pages reject duplicate IDs");
assert.match(events, /strictlyOlder\(current, previous\)/, "event pages must be strictly descending");
assert.match(events, /items\.length !== pageSize/, "event cursor requires a complete page");
assert.match(users, /previous&&compare\(current,previous\)<=0/, "user keyset comparator must accept only rows after the DESC cursor");
assert.match(users, /items\.length!==query\.pageSize/, "user cursor requires a complete page");
assert.match(reports, /hasAdminReportPageOverlap/, "report domain exposes cross-page overlap guard");
assert.match(reportUi, /hasAdminReportPageOverlap\(items,page\.items\)/, "report UI rejects overlap instead of silently deduping");
assert.doesNotMatch(reportUi, /page\.items\.filter\(row=>!previous\.some/, "report UI must not silently discard duplicates");
assert.match(venueUi, /parseAdminVenueCandidatePage\(data, before\)/, "venue candidate UI must validate the requested cursor");
assert.match(venueUi, /VENUE_CANDIDATE_PAGE_OVERLAP/, "venue candidate cross-page overlap fails closed");
console.log("PASS: consolidated V8 platform-admin keyset and response contracts");
