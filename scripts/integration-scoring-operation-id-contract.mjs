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

requireText(edge, "operation_id: z.uuid().optional()", "edge schema accepts operation UUID for commands");
requireText(edge, "cmd.type === \"point\" && !cmd.operation_id", "point command rejects missing operation UUID");
requireText(edge, "path: [\"operation_id\"]", "missing point operation UUID is attributed to operation_id");
requireText(edge, ".eq(\"id\", cmd.operation_id)", "edge retries resolve Point Log by operation UUID");
requireText(edge, "return cmd.operation_id", "operation UUID becomes authoritative Point Log id");
requireText(edge, "OPERATION_CONFLICT", "operation UUID cannot be reused for a different point");
requireText(edge, "const recovered = await findPointOperation(client, cmd)", "version-conflict loser rechecks committed operation");
requireText(matchPage, "type PendingPoint={side:Side;operationId:string}", "optimistic queue retains a stable operation UUID per point");
requireText(matchPage, "operation_id:pending.operationId", "point persistence sends the queued operation UUID");
requireText(matchPage, "operationId:crypto.randomUUID()", "operation UUID is allocated once when the user point is enqueued");

console.log("Scoring operation-id end-to-end contract passed.");
