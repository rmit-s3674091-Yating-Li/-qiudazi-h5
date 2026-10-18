import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-scoring-access-"));
try {
  const source = await readFile("src/domain/MatchScoringAccess.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "MatchScoringAccess.ts",
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      verbatimModuleSyntax: true,
    },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, "access policy must transpile");
  const modulePath = join(tmp, "MatchScoringAccess.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { decideMatchScoringAccess: decide } = await import(pathToFileURL(modulePath).href);

  const event = { id: "event-1", owner_user_id: "owner", status: "ongoing", format: "round_robin" };
  const matches = [
    { id: "match-1", event_id: "event-1", stage: "round_robin", entry_a_id: "entry-a", entry_b_id: "entry-b", is_bye: false, status: "not_started", scoring_mode: null },
    { id: "match-2", event_id: "event-1", stage: "round_robin", entry_a_id: "entry-c", entry_b_id: "entry-d", is_bye: false, status: "not_started", scoring_mode: null },
  ];
  const entry = (id, linkedUser, signupUser = "captain") => ({ id, event_id: "event-1", status: "confirmed", signup_user_id: signupUser, players: [{ id: `player-${id}`, linked_user_id: linkedUser, active: true }] });
  const entries = [entry("entry-a", "alice"), entry("entry-b", "bob"), entry("entry-c", "charlie"), entry("entry-d", "dana")];
  const base = { event, matches, entries, set_scores: [], point_logs: [], viewer_role: "viewer" };
  const check = (actor, action, snapshot = base, matchId = "match-1") => decide(snapshot, actor, matchId, action);
  const deny = (actor, action, reason, snapshot = base, matchId = "match-1") => assert.deepEqual(check(actor, action, snapshot, matchId), { allowed: false, reason });

  assert.deepEqual(check("alice", "point"), { allowed: true, actor: "participant" });
  deny("bob", "score", "ORGANIZER_ONLY");
  assert.deepEqual(check("owner", "undo"), { allowed: true, actor: "organizer" });
  assert.deepEqual(check("owner", "begin"), { allowed: true, actor: "organizer" });
  deny("stranger", "point", "NOT_MATCH_PARTICIPANT");
  deny("captain", "score", "NOT_MATCH_PARTICIPANT");
  deny("unlinked", "point", "NOT_MATCH_PARTICIPANT", { ...base, entries: [entry("entry-a", null), ...entries.slice(1)] });
  deny("charlie", "point", "NOT_MATCH_PARTICIPANT");
  deny("alice", "point", "NOT_MATCH_PARTICIPANT", { ...base, entries: entries.map((e) => e.id === "entry-a" ? { ...e, players: [{ ...e.players[0], active: false }] } : e) });
  deny("alice", "score", "NOT_MATCH_PARTICIPANT", { ...base, entries: entries.map((e) => e.id === "entry-a" ? { ...e, players: [{ id: "legacy-player", linked_user_id: "alice" }] } : e) });
  deny("alice", "point", "PARTICIPANT_POINT_NOT_ALLOWED", { ...base, event: { ...event, format: "knockout" } });
  deny("alice", "point", "PARTICIPANT_POINT_NOT_ALLOWED", { ...base, matches: [{ ...matches[0], stage: "group" }] });
  deny("alice", "point", "PARTICIPANT_POINT_NOT_ALLOWED", { ...base, event: { ...event, format: undefined } });
  deny("alice", "point", "PARTICIPANT_POINT_NOT_ALLOWED", { ...base, matches: [{ ...matches[0], stage: undefined }] });
  deny("alice", "undo", "ORGANIZER_ONLY");
  deny("alice", "begin", "ORGANIZER_ONLY");
  deny("alice", "point", "NOT_MATCH_PARTICIPANT", { ...base, entries: entries.map((e) => e.id === "entry-a" ? { ...e, status: "withdrawn" } : e) });
  deny("alice", "point", "EVENT_CLOSED", { ...base, event: { ...event, status: "finished" } });
  deny("owner", "score", "EVENT_CLOSED", { ...base, event: { ...event, status: "cancelled" } });
  deny("alice", "point", "MATCH_UNAVAILABLE", base, "missing");
  deny("alice", "point", "MATCH_UNAVAILABLE", { ...base, matches: [{ ...matches[0], is_bye: true }] });
  deny("alice", "score", "RESULT_LOCKED", { ...base, matches: [{ ...matches[0], status: "finished" }] });
  assert.deepEqual(check("owner", "score", { ...base, matches: [{ ...matches[0], status: "finished", scoring_mode: "direct" }] }), { allowed: true, actor: "organizer" });
  deny("owner", "begin", "RESULT_LOCKED", { ...base, matches: [{ ...matches[0], status: "finished" }] });
  deny("alice", "point", "SCORING_MODE_CONFLICT", { ...base, matches: [{ ...matches[0], scoring_mode: "direct" }] });
  deny("alice", "score", "ORGANIZER_ONLY", { ...base, matches: [{ ...matches[0], scoring_mode: "live" }] });
  deny("alice", "score", "ORGANIZER_ONLY", { ...base, set_scores: [{ match_id: "match-1" }] });
  deny("alice", "score", "ORGANIZER_ONLY", { ...base, point_logs: [{ match_id: "match-1", voided_at: null }] });
  deny("alice", "score", "ORGANIZER_ONLY", { ...base, point_logs: [{ match_id: "match-1", voided_at: "2026-10-11T00:00:00Z" }] });
  for (const status of ["finished", "cancelled", "paused", "unknown", null, undefined]) {
    const snapshot = { ...base, matches: [{ ...matches[0], status }] };
    deny("alice", "point", "RESULT_LOCKED", snapshot);
    deny("owner", "point", "SCORING_MODE_CONFLICT", snapshot);
  }
  assert.deepEqual(check("alice", "point", { ...base, matches: [{ ...matches[0], status: "ongoing" }] }), { allowed: true, actor: "participant" });
  assert.deepEqual(check("owner", "point", { ...base, matches: [{ ...matches[0], status: "ongoing" }] }), { allowed: true, actor: "organizer" });
  assert.deepEqual(check("charlie", "point", base, "match-2"), { allowed: true, actor: "participant" });

  const policySource = await readFile("src/domain/PointCommandConflict.ts", "utf8");
  const policyCompiled = ts.transpileModule(policySource, { fileName: "PointCommandConflict.ts", compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, reportDiagnostics: true });
  assert.equal(policyCompiled.diagnostics?.length ?? 0, 0);
  const policyPath = join(tmp, "PointCommandConflict.mjs");
  await writeFile(policyPath, policyCompiled.outputText, "utf8");
  const { TournamentCommandError, pointRetryDisposition } = await import(pathToFileURL(policyPath).href);
  const attempt = { eventVersion: 8, matchVersion: 4 };
  const same = { ...attempt };
  assert.equal(pointRetryDisposition(null, attempt, same, true), "committed");
  assert.equal(pointRetryDisposition(null, attempt, null, false), "conflict");
  assert.equal(pointRetryDisposition(null, attempt, { eventVersion: 9, matchVersion: 4 }, false), "conflict");
  assert.equal(pointRetryDisposition(null, attempt, { eventVersion: 8, matchVersion: 5 }, false), "conflict");
  assert.equal(pointRetryDisposition(new TournamentCommandError("conflict", "VERSION_CONFLICT", 409), attempt, same, false), "conflict");
  assert.equal(pointRetryDisposition(new TournamentCommandError("forbidden", null, 403), attempt, same, false), "conflict");
  assert.equal(pointRetryDisposition(new TournamentCommandError("timeout", null, 408), attempt, same, false), "retry");
  assert.equal(pointRetryDisposition(new TournamentCommandError("rate limited", null, 429), attempt, same, false), "retry");
  assert.equal(pointRetryDisposition(new TournamentCommandError("version changed", "VERSION_CONFLICT", 429), attempt, same, false), "conflict");
  assert.equal(pointRetryDisposition(new TournamentCommandError("rate limited", null, 429), attempt, { eventVersion: 9, matchVersion: 4 }, false), "conflict");
  assert.equal(pointRetryDisposition(new TournamentCommandError("server error", null, 500), attempt, same, false), "retry");
  assert.equal(pointRetryDisposition(new Error("network error"), attempt, same, false), "retry");
  const matchSource = await readFile("src/pages/MatchPage.tsx", "utf8");
  const commandSource = await readFile("src/repositories/supabase.ts", "utf8");
  assert.match(matchSource, /pending\.lastAttempt=observed/, "point queue must retain attempted versions");
  assert.match(matchSource, /pointQueue\.current=\[\];setOptimisticPoints\(\[\]\)/, "conflicts must clear unsent optimistic points");
  assert.match(commandSource, /new TournamentCommandError\(explainError/, "Edge HTTP status and code must not be discarded");
  console.log("V8 participant scoring eligibility and point conflict retry tests passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}

// Keep P1 actor isolation, eligibility, retry and Match UI contracts in the default unit gate.
await import("./unit-v8-participant-scoring-eligibility-client.mjs");
await import("./unit-v8-participant-point-route-isolation.mjs");
await import("./unit-v8-point-command-identity.mjs");
await import("./unit-v8-participant-match-point-entry.mjs");
await import("./unit-v8-participant-handoff-consolidated.mjs");
