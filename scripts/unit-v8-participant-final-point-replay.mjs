import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Exercise the actual Edge routing function, not a hand-copied replacement.
// This is an isolated routing contract; DB actor-binding remains integration-tested.
const dir = await mkdtemp(join(tmpdir(), "qiudazi-final-point-replay-"));
try {
  const source = await readFile("supabase/functions/tournament-command/index.ts", "utf8");
  // The Edge must reject impossible int4 versions before invoking the scoring RPC.
  // The event and match versions both increment on a committed point.
  const schemaSource = source.slice(source.indexOf("const schema = z.object("), source.indexOf("type Command ="));
  assert.match(source, /const MAX_INCREMENTABLE_PG_VERSION = 2147483646;/);
  assert.match(source, /const pgVersion = z\.number\(\)\.int\(\)\.min\(1\)\.max\(MAX_INCREMENTABLE_PG_VERSION\);/);
  assert.match(schemaSource, /event_version: pgVersion,/);
  assert.match(schemaSource, /match_version: pgVersion\.optional\(\),/);
  assert.doesNotMatch(schemaSource, /event_version: z\.number\(\)\.int\(\)\.positive\(\)/);
  const start = source.indexOf("async function tryParticipantRoundRobinPoint(");
  const end = source.indexOf("\nDeno.serve(", start);
  assert.ok(start >= 0 && end > start, "participant point route must exist");
  const route = source.slice(start, end);
  assert.match(route, /if \(!prior\) \{[\s\S]*?v8_active_match_participant/,
    "only new operations require the active-scoring preflight");
  assert.match(route, /client\.rpc\("v8_commit_participant_round_robin_point"/,
    "both fresh operations and replays must reach the atomic authorization RPC");
  const binding = await readFile("supabase/migrations/20261013045400_v8_participant_point_replay_actor_binding.sql", "utf8");
  assert.match(binding, /v_binding\.actor_auth_user_id is distinct from p_actor_auth_user_id/);
  assert.match(binding, /v8_commit_participant_round_robin_point_unbound\(/);
  const voidedGuard = await readFile("supabase/migrations/20261020051600_v8_participant_voided_point_replay_guard.sql", "utf8");
  assert.match(voidedGuard, /voided_at is null/);
  assert.match(voidedGuard, /or not v_has_active_point then/);
  assert.match(voidedGuard, /raise exception 'OPERATION_CONFLICT'/);
  assert.match(voidedGuard, /for share of entry_a, entry_b/);
  assert.match(voidedGuard, /grant execute on function public\.v8_commit_participant_round_robin_point\(/);
  const atomic = await readFile("supabase/migrations/20261012215100_v8_participant_round_robin_point_commit.sql", "utf8");
  assert.match(atomic, /ep\.active is true and p\.linked_user_id=v_actor/);
  assert.match(atomic, /for share of en,ep,p/);

  // Receipt validity is exercised separately by unit-v8-participant-point-edge-receipt.mjs.
  // This isolated route test supplies that dependency to test replay and routing decisions.
  const compiled = ts.transpileModule(`const isParticipantPointReceipt = () => true;\n${route}\nexport { tryParticipantRoundRobinPoint };`, {
    fileName: "participant-route.ts",
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const file = join(dir, "participant-route.mjs");
  await writeFile(file, compiled.outputText, "utf8");
  globalThis.json = (payload, status = 200) => ({ payload, status });
  let applyCalls = 0;
  globalThis.applyCommand = (snapshot) => { applyCalls += 1; return { ...snapshot, applied: true }; };
  const { tryParticipantRoundRobinPoint: routePoint } = await import(pathToFileURL(file).href);

  const cmd = { type: "point", event_id: "event-1", match_id: "match-1", match_version: 2,
    event_version: 3, operation_id: "operation-1", side: "A" };
  const snapshot = { event: { id: "event-1", owner_user_id: "owner-profile", format: "round_robin", status: "finished" },
    matches: [{ id: "match-1", event_id: "event-1", stage: "round_robin", status: "finished" }], point_logs: [] };

  function mock({ prior = null, active = false, rpcErrorCode = null, owner = false } = {}) {
    const calls = [];
    const client = {
      from: (table) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
        calls.push(`select:${table}`);
        return { data: table === "events" ? { owner_user_id: owner ? "actor-profile" : "owner-profile" } : prior, error: null };
      } }) }) }),
      rpc: async (name, args) => {
        calls.push(`rpc:${name}`);
        if (name === "v8_active_match_participant") return { data: active, error: null };
        if (name === "get_event_snapshot") return { data: active && !prior ? { ...snapshot, event: { ...snapshot.event, status: "ongoing" }, matches: [{ ...snapshot.matches[0], status: "ongoing" }] } : snapshot, error: null };
        if (name === "v8_commit_participant_round_robin_point") {
          assert.equal(args.p_actor_auth_user_id, "verified-auth-user", "actor must be derived from verified JWT");
          assert.equal(args.p_operation_id, cmd.operation_id);
          return rpcErrorCode ? { data: null, error: new Error(rpcErrorCode) } :
            { data: { committed: true }, error: null };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    };
    return { client, calls };
  }

  // A final point may finish the event. The same operation must still reach
  // the locked RPC for safe idempotent recovery, not fail the live preflight.
  const prior = { id: cmd.operation_id, match_id: cmd.match_id, winner_side: "A" };
  let m = mock({ prior, active: false });
  assert.deepEqual(await routePoint(m.client, cmd, "verified-auth-user", "actor-profile"),
    { payload: { committed: true }, status: 200 });
  assert.ok(!m.calls.includes("rpc:v8_active_match_participant"), "final-point replay must bypass live-only preflight");
  assert.ok(m.calls.includes("rpc:v8_commit_participant_round_robin_point"), "replay still requires atomic authorization");
  assert.equal(applyCalls, 0, "replay must not recompute a second point");

  // A fresh point after match completion is not a replay and must fail closed.
  m = mock({ active: false });
  assert.deepEqual(await routePoint(m.client, cmd, "verified-auth-user", "actor-profile"),
    { payload: { error: "当前账号不是该场比赛的实际参赛者", code: "NOT_MATCH_PARTICIPANT" }, status: 403 });
  assert.ok(!m.calls.includes("rpc:get_event_snapshot"));
  assert.ok(!m.calls.includes("rpc:v8_commit_participant_round_robin_point"));

  // A fresh eligible point retains the normal preflight + atomic transaction.
  m = mock({ active: true });
  assert.deepEqual(await routePoint(m.client, cmd, "verified-auth-user", "actor-profile"),
    { payload: { committed: true }, status: 200 });
  assert.ok(m.calls.includes("rpc:v8_active_match_participant"));
  assert.ok(m.calls.includes("rpc:v8_commit_participant_round_robin_point"));
  assert.equal(applyCalls, 1, "a fresh point must compute exactly one scoring transition");

  // An operation ID reused for a different side never reaches the RPC.
  m = mock({ prior: { ...prior, winner_side: "B" } });
  assert.deepEqual(await routePoint(m.client, cmd, "verified-auth-user", "actor-profile"),
    { payload: { error: "operation_id 已用于另一条得分操作", code: "OPERATION_CONFLICT" }, status: 409 });
  assert.ok(!m.calls.includes("rpc:v8_commit_participant_round_robin_point"));

  // Edge cannot grant a replay: a rejected binding from the RPC must propagate.
  m = mock({ prior, rpcErrorCode: "OPERATION_CONFLICT" });
  await assert.rejects(() => routePoint(m.client, cmd, "verified-auth-user", "actor-profile"), /OPERATION_CONFLICT/);

  // Revoked membership must still be denied by the locked RPC on replay.
  m = mock({ prior, rpcErrorCode: "NOT_MATCH_PARTICIPANT" });
  await assert.rejects(() => routePoint(m.client, cmd, "verified-auth-user", "actor-profile"), /NOT_MATCH_PARTICIPANT/);

  // Organizer retains its existing independent command route.
  m = mock({ owner: true });
  assert.equal(await routePoint(m.client, cmd, "verified-auth-user", "actor-profile"), null);

  // Execute the real Edge Auth branch: upstream errors must not masquerade as
  // invalid credentials, and no unverified actor may reach the profile RPC.
  const authStart = source.indexOf("    const { data: { user }, error: authError } = await client.auth.getUser(token);");
  const authEnd = source.indexOf('    const { data: profiles, error: profileError }', authStart);
  assert.ok(authStart >= 0 && authEnd > authStart, "Edge Auth gate must precede profile resolution");
  const authBranch = source.slice(authStart, authEnd);
  const checkAuth = new Function("client", "json", `return (async () => {
    const token = "test-jwt";
    ${authBranch}
    return { verifiedUserId: user.id };
  })();`);
  const reply = (body, status = 200) => ({ body, status });
  const authClient = (status, userId = null) => ({
    auth: { getUser: async () => ({
      data: { user: userId ? { id: userId } : null },
      error: status === null ? null : Object.assign(new Error("Auth upstream"), { status }),
    }) },
    rpc: () => { throw new Error("unverified actor reached profile RPC"); },
  });
  for (const status of [400, 401, 403, 422]) {
    assert.deepEqual(await checkAuth(authClient(status), reply), {
      body: { error: "身份已失效，请刷新页面恢复登录", code: "AUTH_REQUIRED" }, status: 401,
    }, `invalid credential status ${status}`);
  }
  for (const status of [429, 500, 503, undefined]) {
    assert.deepEqual(await checkAuth(authClient(status), reply), {
      body: { error: "身份验证服务暂不可用，请稍后重试", code: "AUTH_CHECK_UNAVAILABLE" }, status: 503,
    }, `Auth upstream status ${status}`);
  }
  assert.deepEqual(await checkAuth(authClient(null), reply), {
    body: { error: "身份已失效，请刷新页面恢复登录", code: "AUTH_REQUIRED" }, status: 401,
  }, "missing user without an Auth error is not authenticated");
  assert.deepEqual(await checkAuth(authClient(null, "verified-auth-user"), reply), {
    verifiedUserId: "verified-auth-user",
  }, "verified JWT may proceed to the profile RPC");
  console.log("PASS: V8 tournament-command Auth failure classification (10 cases)");
  console.log("PASS: V8 participant final-point replay / fresh authorization / actor-binding delegation");
} finally {
  delete globalThis.json;
  delete globalThis.applyCommand;
  await rm(dir, { recursive: true, force: true });
}
