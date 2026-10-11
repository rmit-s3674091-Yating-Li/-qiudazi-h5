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

  const event = { id: "event-1", owner_user_id: "owner", status: "ongoing" };
  const matches = [
    {
      id: "match-1",
      event_id: "event-1",
      entry_a_id: "entry-a",
      entry_b_id: "entry-b",
      is_bye: false,
      status: "not_started",
      scoring_mode: null,
    },
    {
      id: "match-2",
      event_id: "event-1",
      entry_a_id: "entry-c",
      entry_b_id: "entry-d",
      is_bye: false,
      status: "not_started",
      scoring_mode: null,
    },
  ];
  const entry = (id, linkedUser, signupUser = "captain") => ({
    id,
    event_id: "event-1",
    status: "confirmed",
    signup_user_id: signupUser,
    players: [{ id: `player-${id}`, linked_user_id: linkedUser }],
  });
  const entries = [
    entry("entry-a", "alice"),
    entry("entry-b", "bob"),
    entry("entry-c", "charlie"),
    entry("entry-d", "dana"),
  ];
  const base = { event, matches, entries, set_scores: [], point_logs: [], viewer_role: "viewer" };
  const check = (actor, action, snapshot = base, matchId = "match-1") =>
    decide(snapshot, actor, matchId, action);
  const deny = (actor, action, reason, snapshot = base, matchId = "match-1") =>
    assert.deepEqual(check(actor, action, snapshot, matchId), { allowed: false, reason });

  assert.deepEqual(check("alice", "point"), { allowed: true, actor: "participant" });
  assert.deepEqual(check("bob", "score"), { allowed: true, actor: "participant" });
  assert.deepEqual(check("owner", "undo"), { allowed: true, actor: "organizer" });
  assert.deepEqual(check("owner", "begin"), { allowed: true, actor: "organizer" });
  deny("stranger", "point", "NOT_MATCH_PARTICIPANT");
  deny("captain", "score", "NOT_MATCH_PARTICIPANT");
  deny("unlinked", "point", "NOT_MATCH_PARTICIPANT", {
    ...base,
    entries: [entry("entry-a", null), ...entries.slice(1)],
  });
  deny("charlie", "point", "NOT_MATCH_PARTICIPANT");
  deny("alice", "undo", "ORGANIZER_ONLY");
  deny("alice", "begin", "ORGANIZER_ONLY");
  deny("alice", "point", "NOT_MATCH_PARTICIPANT", {
    ...base,
    entries: entries.map((e) => (e.id === "entry-a" ? { ...e, status: "withdrawn" } : e)),
  });
  deny("alice", "point", "EVENT_CLOSED", { ...base, event: { ...event, status: "finished" } });
  deny("owner", "score", "EVENT_CLOSED", { ...base, event: { ...event, status: "cancelled" } });
  deny("alice", "point", "MATCH_UNAVAILABLE", base, "missing");
  deny("alice", "point", "MATCH_UNAVAILABLE", { ...base, matches: [{ ...matches[0], is_bye: true }] });
  deny("alice", "score", "RESULT_LOCKED", { ...base, matches: [{ ...matches[0], status: "finished" }] });
  assert.deepEqual(
    check("owner", "score", {
      ...base,
      matches: [{ ...matches[0], status: "finished", scoring_mode: "direct" }],
    }),
    { allowed: true, actor: "organizer" },
  );
  deny("owner", "begin", "RESULT_LOCKED", {
    ...base,
    matches: [{ ...matches[0], status: "finished" }],
  });
  deny("alice", "point", "SCORING_MODE_CONFLICT", {
    ...base,
    matches: [{ ...matches[0], scoring_mode: "direct" }],
  });
  deny("alice", "score", "SCORING_MODE_CONFLICT", {
    ...base,
    matches: [{ ...matches[0], scoring_mode: "live" }],
  });
  deny("alice", "score", "SCORING_MODE_CONFLICT", {
    ...base,
    set_scores: [{ match_id: "match-1" }],
  });
  deny("alice", "score", "SCORING_MODE_CONFLICT", {
    ...base,
    point_logs: [{ match_id: "match-1", voided_at: null }],
  });
  assert.deepEqual(
    check("alice", "score", {
      ...base,
      point_logs: [{ match_id: "match-1", voided_at: "2026-10-11T00:00:00Z" }],
    }),
    { allowed: true, actor: "participant" },
  );
  assert.deepEqual(check("charlie", "point", base, "match-2"), {
    allowed: true,
    actor: "participant",
  });
  console.log("V8 participant scoring eligibility domain tests passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
