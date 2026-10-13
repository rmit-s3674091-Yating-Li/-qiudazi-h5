import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile("supabase/functions/platform-admin-events/index.ts", "utf8");
assert.match(source, /client\.auth\.getUser\(token\)/, "Edge verifies JWT");
assert.match(source, /p_actor_auth_user_id: user\.id/, "actor is derived from JWT");
assert.match(source, /client\.rpc\("platform_admin_list_events"/, "dedicated SQL RPC");
assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/, "event directory is read-only");
const runnable = source.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2\.112\.4";\n/, "");
assert.notEqual(runnable, source, "Deno import must be explicitly recognized");
const compiled = ts.transpileModule(runnable, {
  fileName: "platform-admin-events.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "Edge TS syntax");

const actor = "a1111111-1111-4111-8111-111111111111";
const eventId = "b1111111-1111-4111-8111-111111111111";
const ownerId = "c1111111-1111-4111-8111-111111111111";
const row = {
  id: eventId, name: "Test event", owner_user_id: ownerId, status: "signup",
  version: 2, visibility: "private", event_mode: "standard",
  match_type: "singles", format: "round_robin", city: "Beijing",
  event_date: "2026-10-20", created_at: "2026-10-12T01:00:00+00:00",
};
let handler;
let rpcResult = { data: { items: [row], next_cursor: null }, error: null };
let lastArgs;
let authError = null;
let envAvailable = true;
const client = {
  auth: { getUser: async (token) => token === "valid-token" ?
    { data: { user: { id: actor } }, error: authError } :
    { data: { user: null }, error: { message: "bad jwt" } } },
  rpc: async (name, args) => {
    assert.equal(name, "platform_admin_list_events");
    lastArgs = args;
    return rpcResult;
  },
};
vm.runInNewContext(compiled.outputText, {
  createClient: () => client,
  Deno: {
    serve: (fn) => { handler = fn; },
    env: { get: (name) => envAvailable ? (name === "SUPABASE_URL" ? "https://example.invalid" : "secret") : null },
  },
  Response, Request, Date, Object, Number, JSON, String,
}, { filename: "platform-admin-events.transpiled.js" });
assert.equal(typeof handler, "function");
async function call(body, token = "valid-token", method = "POST") {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const req = new Request("https://example.invalid/platform-admin-events", {
    method, headers, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  const res = await handler(req);
  return { status: res.status, body: res.status === 204 ? null : await res.json(), headers: res.headers };
}
assert.equal((await call({}, null)).status, 401);
assert.equal((await call({}, "expired-token")).status, 401);
assert.equal((await call({}, "valid-token", "GET")).status, 405);
assert.equal((await call({}, "valid-token", "OPTIONS")).status, 204);
for (const bad of [{ actor_id: actor }, { status: "all" }, { page_size: 51 },
  { page_size: 0 }, { before: { id: eventId } }, { before: { created_at: row.created_at, id: "invalid" } },
  { status: "signup", before: { created_at: row.created_at, id: eventId, extra: "x" } }]) {
  assert.equal((await call(bad)).status, 400, JSON.stringify(bad));
}
assert.equal((await call("{" )).status, 400);
assert.equal((await call({ padding: "x".repeat(3000) })).status, 413);
const success = await call({ page_size: 5, status: "signup" });
assert.equal(success.status, 200);
assert.equal(success.body.items.length, 1);
assert.equal(success.headers.get("cache-control"), "no-store");
assert.equal(lastArgs.p_actor_auth_user_id, actor);
assert.equal(lastArgs.p_page_size, 5);
assert.equal(lastArgs.p_status, "signup");
assert.equal(lastArgs.p_before_id, null);
assert.equal((await call({ before: { created_at: row.created_at, id: eventId } })).status, 200);
assert.equal(lastArgs.p_before_id, eventId);
assert.equal(lastArgs.p_before_created_at, row.created_at);
rpcResult = { data: { items: [row], next_cursor: { created_at: row.created_at, id: eventId } }, error: null };
assert.equal((await call({})).status, 200);
rpcResult = { data: { items: [{ ...row, private_email: "sensitive@example.invalid" }], next_cursor: null }, error: null };
assert.deepEqual((await call({})).body, { code: "EVENT_DIRECTORY_UNAVAILABLE" });
rpcResult = { data: { items: [row], next_cursor: { created_at: row.created_at, id: ownerId } }, error: null };
assert.equal((await call({})).status, 503, "cursor must match final item");
rpcResult = { data: null, error: { message: "PLATFORM_ADMIN_FORBIDDEN" } };
assert.equal((await call({})).status, 403, "revoked admin role must fail closed");
rpcResult = { data: null, error: { message: "internal table secret" } };
assert.deepEqual((await call({})).body, { code: "EVENT_DIRECTORY_UNAVAILABLE" });
authError = { message: "expired" };
assert.equal((await call({})).status, 401);
authError = null;
envAvailable = false;
assert.equal((await call({})).status, 503);
console.log("V8 Platform Admin event directory Edge contract passed");
