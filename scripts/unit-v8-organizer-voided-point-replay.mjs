import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Exercise the actual organizer replay helper. A voided point remains in
// point_logs, but must never be acknowledged as a successful active score.
const edge = await readFile("supabase/functions/tournament-command/index.ts", "utf8");
const start = edge.indexOf("async function findPointOperation(");
const end = edge.indexOf("\nasync function tryParticipantRoundRobinPoint(", start);
assert.ok(start >= 0 && end > start, "extract the real Edge replay helper");
const compiled = ts.transpileModule(edge.slice(start, end), {
  fileName: "tournament-command-replay.ts",
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const findPointOperation = new Function(`${compiled.outputText}\nreturn findPointOperation;`)();
const cmd = { type: "point", event_id: "event-1", match_id: "match-1", side: "A", operation_id: "op-1" };
const active = { id: "op-1", match_id: "match-1", winner_side: "A", voided_at: null };
const snapshot = {
  event: { id: "event-1" },
  matches: [{ id: "match-1", event_id: "event-1" }],
  point_logs: [active],
};
function mock(point = active, returned = snapshot) {
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, "point_logs");
      return { select(fields) {
        assert.equal(fields, "id,match_id,winner_side,voided_at", "voided status must be read from DB");
        return { eq(column, value) {
          assert.equal(column, "id"); assert.equal(value, cmd.operation_id);
          return { maybeSingle: async () => { calls.push("point"); return { data: point, error: null }; } };
        } };
      } };
    },
    async rpc(name, args) {
      assert.equal(name, "get_event_snapshot_for_actor");
      assert.deepEqual(args, { p_event_id: cmd.event_id, p_actor_auth_user_id: "verified-actor" });
      calls.push("snapshot");
      return { data: returned, error: null };
    },
  };
  return { client, calls };
}
let m = mock();
assert.deepEqual(await findPointOperation(m.client, cmd, "verified-actor"), { conflict: false, snapshot });
assert.deepEqual(m.calls, ["point", "snapshot"], "active point replay may load actor-scoped snapshot");
for (const [label, point] of [
  ["voided", { ...active, voided_at: "2026-10-20T00:00:00Z" }],
  ["missing status", { id: active.id, match_id: active.match_id, winner_side: active.winner_side }],
  ["wrong side", { ...active, winner_side: "B" }],
  ["wrong match", { ...active, match_id: "match-2" }],
]) {
  m = mock(point);
  assert.deepEqual(await findPointOperation(m.client, cmd, "verified-actor"), { conflict: true, snapshot: null }, label);
  assert.deepEqual(m.calls, ["point"], `${label}: no snapshot replay on conflict`);
}
m = mock(null);
assert.equal(await findPointOperation(m.client, cmd, "verified-actor"), null, "new operation has no prior replay");
assert.deepEqual(m.calls, ["point"]);
for (const [label, returned] of [
  ["snapshot voided", { ...snapshot, point_logs: [{ ...active, voided_at: "2026-10-20T00:00:00Z" }] }],
  ["snapshot missing status", { ...snapshot, point_logs: [{ id: active.id, match_id: active.match_id, winner_side: active.winner_side }] }],
  ["snapshot missing operation", { ...snapshot, point_logs: [] }],
  ["wrong event", { ...snapshot, event: { id: "event-2" } }],
]) {
  m = mock(active, returned);
  assert.deepEqual(await findPointOperation(m.client, cmd, "verified-actor"), { conflict: true, snapshot: null }, label);
}
assert.match(edge, /const recovered = await findPointOperation\(client, cmd, user\.id\)/,
  "version-conflict recovery must share the same voided-point guard");
console.log("PASS: V8 organizer point replay rejects voided/malformed history and retains active idempotency");
