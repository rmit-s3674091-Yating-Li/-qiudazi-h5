import fs from "node:fs";

const edge = fs.readFileSync("supabase/functions/tournament-command/index.ts", "utf8");
const matchPage = fs.readFileSync("src/pages/MatchPage.tsx", "utf8");

function requireText(source, text, label) {
  if (!source.includes(text)) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`PASS: ${label}`);
}

function requireMatch(source, pattern, label) {
  if (!pattern.test(source)) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`PASS: ${label}`);
}

requireText(edge, "operation_id: z.uuid().optional()", "edge schema accepts operation UUID for commands");
requireMatch(edge, /if\s*\(cmd\.type\s*===\s*"point"\)\s*\{\s*if\s*\(!cmd\.operation_id\)/, "point command rejects missing operation UUID");
requireText(edge, "path: [\"operation_id\"]", "missing point operation UUID is attributed to operation_id");
requireText(edge, ".eq(\"id\", cmd.operation_id)", "edge retries resolve Point Log by operation UUID");
requireText(edge, "return cmd.operation_id", "operation UUID becomes authoritative Point Log id");
requireText(edge, "OPERATION_CONFLICT", "operation UUID cannot be reused for a different point");
requireText(edge, "current.event.id !== cmd.event_id", "point replay is bound to its original event");
requireText(edge, "match.id === cmd.match_id && match.event_id === cmd.event_id", "point replay match belongs to requested event");
requireText(edge, "log.id === cmd.operation_id && log.match_id === cmd.match_id && log.winner_side === cmd.side", "point replay is backed by the authoritative point log");
requireText(edge, "return { conflict: true as const, snapshot: null }", "cross-event point replay fails closed");
requireText(edge, "const recovered = await findPointOperation(client, cmd, user.id)", "version-conflict loser rechecks committed operation with actor context");
requireMatch(matchPage, /type PendingPoint\s*=\s*\{[^}]*\boperationId\s*:\s*string\b/, "optimistic queue retains a stable operation UUID per point");
requireText(matchPage, "operation_id:pending.operationId", "point persistence sends the queued operation UUID");
requireText(matchPage, "operationId:crypto.randomUUID()", "operation UUID is allocated once when the user point is enqueued");
requireText(matchPage, "const reconciled=await q.refresh()", "lost response reconciles against authoritative snapshot before retry");
requireText(matchPage, "log.id===pending.operationId", "reconcile recognizes an already committed Point Log by the same operation UUID");
requireText(matchPage, "next=await command(current.event.id,{type:\"point\"", "unconfirmed lost response retries the original pending operation");
requireMatch(matchPage, /catch\s*\(e\)\s*\{\s*(?:if\s*\(!active\(\)\)return;\s*)?setOptimisticPoints\(\[\.\.\.pointQueue\.current\]\)/, "transient failures preserve pending operations for safe retry");
requireMatch(matchPage, /if\s*\(disposition\s*===\s*"conflict"\)\s*\{\s*pointQueue\.current\s*=\s*\[\];\s*setOptimisticPoints\(\[\]\)/, "rejected or stale points clear optimistic state rather than replaying");
requireText(matchPage, "pointRetryDisposition(", "point retries use conflict-aware disposition");

console.log("Scoring operation-id end-to-end contract passed.");
