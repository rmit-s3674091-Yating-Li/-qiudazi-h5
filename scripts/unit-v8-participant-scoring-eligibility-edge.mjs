import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "qiudazi-participant-eligibility-"));
const uuidA = "11111111-1111-4111-8111-111111111111";
const uuidB = "22222222-2222-4222-8222-222222222222";
const uuidC = "33333333-3333-4333-8333-333333333333";
const uuidD = "44444444-4444-4444-8444-444444444444";
const event = { id: uuidA, format: "round_robin", status: "ongoing" };
const match = { id: uuidB, event_id: uuidA, stage: "round_robin", status: "ongoing", scoring_mode: "live", is_bye: false, entry_a_id: uuidC, entry_b_id: uuidD };
let handler;
let state;
const calls = [];
try {
  const source = await readFile(new URL("../supabase/functions/participant-scoring-eligibility/index.ts", import.meta.url), "utf8");
  assert.match(source, /UI discovery only/);
  assert.match(source, /v8_commit_participant_round_robin_point/);
  assert.doesNotMatch(source, /client\.rpc\("v8_commit_participant_round_robin_point"/);
  const patched = source.replace(/import \{ createClient \} from "npm:@supabase\/supabase-js@2\.112\.4";/,
    "const createClient = globalThis.__testCreateClient;");
  assert.notEqual(patched, source, "must replace the Supabase import for isolated execution");
  const compiled = ts.transpileModule(patched, { fileName: "index.ts", reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const file = join(dir, "edge.mjs");
  await writeFile(file, compiled.outputText, "utf8");
  globalThis.Deno = { env: { get: (name) => ({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "server-only-test" })[name] }, serve: (fn) => { handler = fn; } };
  globalThis.__testCreateClient = (_url, _key, config) => {
    assert.equal(config.auth.persistSession, false);
    return {
      auth: { getUser: async (token) => { calls.push(["auth", token]); return state.authError ? { data: { user: null }, error: new Error("bad token") } : { data: { user: { id: "verified-user" } }, error: null }; } },
      rpc: async (name, args) => { calls.push(["rpc", name, args]); assert.equal(name, "v8_active_match_participant"); assert.equal(args.p_actor_auth_user_id, "verified-user"); return { data: state.active, error: state.rpcError ? new Error("internal") : null }; },
      from: (table) => ({ select: (_fields) => ({ eq: (_key, _value) => ({
        maybeSingle: async () => {
          calls.push(["select", table]);
          return { data: table === "events" ? state.event : state.match, error: state.dbError ? new Error("internal") : null };
        },
        in: async (field, ids) => {
          assert.equal(table, "entries");
          assert.equal(_key, "event_id");
          assert.equal(_value, uuidA);
          assert.equal(field, "id");
          assert.deepEqual(ids, [uuidC, uuidD]);
          calls.push(["select", table]);
          return { data: state.entries, error: state.entriesError ? new Error("internal") : null };
        },
      }) }) }),
    };
  };
  await import(pathToFileURL(file).href);
  assert.equal(typeof handler, "function");

  async function invoke(body = { event_id: uuidA, match_id: uuidB }, auth = "Bearer good", method = "POST") {
    calls.length = 0;
    const headers = auth ? { Authorization: auth } : {};
    const response = await handler(new Request("https://example.test/participant-scoring-eligibility", {
      method, headers, ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }));
    const payload = method === "OPTIONS" ? null : await response.json();
    assert.equal(response.headers.get("cache-control"), method === "OPTIONS" ? null : "no-store");
    return { status: response.status, payload };
  }
  function reset(overrides = {}) { state = {
    active: true, event, match,
    entries: [{ id: uuidC, status: "confirmed" }, { id: uuidD, status: "confirmed" }],
    authError: false, rpcError: false, dbError: false, entriesError: false, ...overrides,
  }; }
  reset();
  assert.deepEqual(await invoke(), { status: 200, payload: { eligible: true } });
  assert.deepEqual(calls.map(x => x[0]), ["auth", "rpc", "select", "select", "select"]);
  reset({ match: { ...match, status: "not_started", scoring_mode: null } });
  assert.deepEqual(await invoke(), { status: 200, payload: { eligible: true } });
  // The authenticated player is still active, but the opponent is not.
  // Preflight must fail closed instead of exposing a point button that the
  // atomic RPC will reject. A missing/duplicate entry is equally ineligible.
  for (const entries of [
    [{ id: uuidC, status: "confirmed" }, { id: uuidD, status: "withdrawn" }],
    [{ id: uuidC, status: "confirmed" }],
    [],
    [{ id: uuidC, status: "confirmed" }, { id: uuidC, status: "confirmed" }],
  ]) {
    reset({ entries });
    assert.deepEqual(await invoke(), { status: 200, payload: { eligible: false } });
  }
  reset({ entriesError: true });
  assert.deepEqual(await invoke(), { status: 503, payload: { error: "SERVICE_UNAVAILABLE" } });
  reset({ active: false });
  assert.deepEqual(await invoke(), { status: 200, payload: { eligible: false } });
  assert.deepEqual(calls.map(x => x[0]), ["auth", "rpc"]);
  for (const invalid of [
    { ...match, stage: "knockout" }, { ...match, scoring_mode: "direct" },
    { ...match, status: "finished" }, { ...match, status: "cancelled" },
    { ...match, status: "paused" }, { ...match, status: "unknown" },
    { ...match, status: null }, { ...match, is_bye: true },
    { ...match, entry_a_id: null }, { ...match, event_id: uuidC },
  ]) {
    reset({ match: invalid });
    assert.deepEqual(await invoke(), { status: 200, payload: { eligible: false } });
  }
  for (const invalidEvent of [{ ...event, format: "group_knockout" }, { ...event, status: "finished" }]) {
    reset({ event: invalidEvent });
    assert.deepEqual(await invoke(), { status: 200, payload: { eligible: false } });
  }
  reset();
  assert.deepEqual(await invoke({ event_id: uuidA, match_id: uuidB, actor_id: "attacker" }), { status: 400, payload: { error: "INVALID_REQUEST" } });
  assert.deepEqual(await invoke({ event_id: "invalid", match_id: uuidB }), { status: 400, payload: { error: "INVALID_REQUEST" } });
  assert.deepEqual(await invoke(undefined, null), { status: 401, payload: { error: "AUTH_REQUIRED" } });
  reset({ authError: true });
  assert.deepEqual(await invoke(), { status: 401, payload: { error: "AUTH_REQUIRED" } });
  assert.deepEqual(calls.map(x => x[0]), ["auth"]);
  reset({ rpcError: true });
  assert.deepEqual(await invoke(), { status: 503, payload: { error: "SERVICE_UNAVAILABLE" } });
  reset({ dbError: true });
  assert.deepEqual(await invoke(), { status: 503, payload: { error: "SERVICE_UNAVAILABLE" } });
  reset();
  assert.deepEqual(await invoke(undefined, "Bearer good", "GET"), { status: 405, payload: { error: "METHOD_NOT_ALLOWED" } });
  assert.equal((await invoke(undefined, "Bearer good", "OPTIONS")).status, 200);
  console.log("PASS V8 participant scoring eligibility Edge read-only contract");
} finally {
  delete globalThis.__testCreateClient;
  delete globalThis.Deno;
  await rm(dir, { recursive: true, force: true });
}

// Always run the final-point replay safety contract in the default unit gate.
await import("./unit-v8-participant-final-point-replay.mjs");
await import("./unit-v8-participant-point-edge-receipt.mjs");
