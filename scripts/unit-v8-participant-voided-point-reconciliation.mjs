import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temp = await mkdtemp(join(tmpdir(), "qiudazi-v8-voided-point-"));
try {
  async function loadModule(sourcePath, outputName) {
    const source = await readFile(sourcePath, "utf8");
    const compiled = ts.transpileModule(source, {
      fileName: sourcePath,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    });
    assert.equal(compiled.diagnostics?.length ?? 0, 0, `${sourcePath} transpiles`);
    const output = join(temp, outputName);
    await writeFile(output, compiled.outputText, "utf8");
    return import(pathToFileURL(output).href);
  }
  const { isActiveCommittedPoint, uncommittedPointQueue } = await loadModule(
    "src/domain/PointQueueReconciliation.ts", "queue.mjs");
  const { isParticipantPointReceipt } = await loadModule(
    "src/domain/ParticipantPointReceipt.ts", "receipt.mjs");
  const pending = [{ operationId: "op-1", side: "A" }];
  const active = { id: "op-1", match_id: "match-1", winner_side: "A", voided_at: null };
  const voided = { ...active, voided_at: "2026-10-20T02:00:00Z" };
  assert.equal(isActiveCommittedPoint(active, "op-1", "match-1", "A"), true);
  assert.equal(isActiveCommittedPoint(voided, "op-1", "match-1", "A"), false);
  assert.equal(isActiveCommittedPoint(active, "op-1", "match-1", "B"), false);
  assert.deepEqual(uncommittedPointQueue(pending, [active], "match-1"), []);
  assert.deepEqual(uncommittedPointQueue(pending, [voided], "match-1"), pending);
  assert.deepEqual(uncommittedPointQueue(pending, [{ ...active, winner_side: "B" }], "match-1"), pending);
  const ids = { eventId: "event-1", matchId: "match-1", operationId: "op-1",
    side: "A", expectedEventVersion: 3, expectedMatchVersion: 2 };
  const receipt = { viewer_role: "participant", event: { id: "event-1", version: 4 },
    matches: [{ id: "match-1", event_id: "event-1", version: 3 }],
    entries: [], set_scores: [], point_logs: [active], photo: null };
  assert.equal(isParticipantPointReceipt(receipt, ids), true);
  assert.equal(isParticipantPointReceipt({ ...receipt, point_logs: [voided] }, ids), false,
    "an undone point must not pass the Edge success receipt");
  const page = await readFile("src/pages/MatchPage.tsx", "utf8");
  for (const snapshot of ["current", "reconciled", "finalSnapshot"]) {
    assert.ok(page.includes(`${snapshot}.point_logs.some(log=>isActiveCommittedPoint(`),
      `${snapshot} must exclude voided point logs during queue reconciliation`);
  }
  console.log("PASS: V8 voided-point receipt, optimistic queue and retry reconciliation");
} finally {
  await rm(temp, { recursive: true, force: true });
}
