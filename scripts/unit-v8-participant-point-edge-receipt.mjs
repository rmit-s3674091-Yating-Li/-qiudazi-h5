import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temp = await mkdtemp(join(tmpdir(), "qiudazi-v8-point-receipt-"));
try {
  const source = await readFile(new URL("../src/domain/ParticipantPointReceipt.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "ParticipantPointReceipt.ts",
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const output = join(temp, "receipt.mjs");
  await writeFile(output, compiled.outputText, "utf8");
  const { isParticipantPointReceipt } = await import(pathToFileURL(output).href);
  const ids = {
    eventId: "11111111-1111-4111-8111-111111111111",
    matchId: "22222222-2222-4222-8222-222222222222",
    operationId: "33333333-3333-4333-8333-333333333333",
    side: "A", expectedEventVersion: 4, expectedMatchVersion: 7,
  };
  const receipt = {
    viewer_role: "participant",
    event: { id: ids.eventId, version: 5 },
    matches: [{ id: ids.matchId, event_id: ids.eventId, version: 8 }],
    point_logs: [{ id: ids.operationId, match_id: ids.matchId, winner_side: "A", voided_at: null }],
    entries: [], set_scores: [], photo: null,
  };
  assert.equal(isParticipantPointReceipt(receipt, ids), true, "fresh atomic commit");
  assert.equal(isParticipantPointReceipt({ ...receipt, event: { ...receipt.event, version: 12 }, matches: [{ ...receipt.matches[0], version: 15 }] }, ids), true, "later replay snapshot may advance");
  for (const [label, candidate] of [
    ["null", null],
    ["empty", {}],
    ["missing role", { ...receipt, viewer_role: undefined }],
    ["wrong role", { ...receipt, viewer_role: "owner" }],
    ["wrong event", { ...receipt, event: { ...receipt.event, id: ids.matchId } }],
    ["stale event version", { ...receipt, event: { ...receipt.event, version: 4 } }],
    ["stale match version", { ...receipt, matches: [{ ...receipt.matches[0], version: 7 }] }],
    ["wrong match", { ...receipt, matches: [{ ...receipt.matches[0], id: ids.eventId }] }],
    ["duplicate match", { ...receipt, matches: [...receipt.matches, ...receipt.matches] }],
    ["missing point", { ...receipt, point_logs: [] }],
    ["missing voided status", { ...receipt, point_logs: [{ id: ids.operationId, match_id: ids.matchId, winner_side: "A" }] }],
    ["undefined voided status", { ...receipt, point_logs: [{ ...receipt.point_logs[0], voided_at: undefined }] }],
    ["voided point", { ...receipt, point_logs: [{ ...receipt.point_logs[0], voided_at: "2026-10-20T10:00:00Z" }] }],
    ["wrong side", { ...receipt, point_logs: [{ ...receipt.point_logs[0], winner_side: "B" }] }],
    ["wrong point match", { ...receipt, point_logs: [{ ...receipt.point_logs[0], match_id: ids.eventId }] }],
    ["duplicate point", { ...receipt, point_logs: [...receipt.point_logs, ...receipt.point_logs] }],
    ["invalid arrays", { ...receipt, entries: null }],
    ["invalid photo", { ...receipt, photo: "unexpected" }],
  ]) assert.equal(isParticipantPointReceipt(candidate, ids), false, label);

  const edge = await readFile(new URL("../supabase/functions/tournament-command/index.ts", import.meta.url), "utf8");
  assert.match(edge, /import \{ isParticipantPointReceipt \} from "\.\.\/\.\.\/\.\.\/src\/domain\/ParticipantPointReceipt\.ts"/);
  assert.match(edge, /if \(!isParticipantPointReceipt\(result\.data, \{/);
  assert.match(edge, /PARTICIPANT_POINT_RECEIPT_INVALID/);
  console.log("PASS V8 participant point Edge success receipt contract");
} finally {
  await rm(temp, { recursive: true, force: true });
}
