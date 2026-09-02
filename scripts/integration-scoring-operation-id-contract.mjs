import fs from "node:fs";

const edge = fs.readFileSync("supabase/functions/tournament-command/index.ts", "utf8");

function requireText(source, text, label) {
  if (!source.includes(text)) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`PASS: ${label}`);
}

requireText(edge, "operation_id: z.uuid().optional()", "edge command contract accepts operation UUID");
requireText(edge, ".eq(\"id\", cmd.operation_id)", "edge retries resolve Point Log by operation UUID");
requireText(edge, "return cmd.operation_id", "operation UUID becomes authoritative Point Log id");
requireText(edge, "OPERATION_CONFLICT", "operation UUID cannot be reused for a different point");
requireText(edge, "const recovered = await findPointOperation(client, cmd)", "version-conflict loser rechecks committed operation");

console.log("Scoring operation-id server contract passed.");
