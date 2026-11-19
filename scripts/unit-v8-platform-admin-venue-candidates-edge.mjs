import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile("supabase/functions/platform-admin-venue-candidates/index.ts", "utf8");
assert.match(source, /client\.auth\.getUser\(token\)/, "Edge verifies JWT");
assert.match(source, /p_actor_auth_user_id: user\.id/, "actor comes from verified JWT");
assert.match(source, /client\.rpc\("platform_admin_list_event_venue_candidates"/, "dedicated SQL RPC");
assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/, "directory must remain read-only");
const runnable = source.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2\.112\.4";\n/, "");
assert.notEqual(runnable, source, "recognized Deno import");
const compiled = ts.transpileModule(runnable, {
  fileName: "platform-admin-venue-candidates.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "TypeScript syntax");

const actor = "a1111111-1111-4111-8111-111111111111";
const eventId = "b1111111-1111-4111-8111-111111111111";
const olderId = "a1111111-1111-4111-8111-111111111111";
const createdAt = "2026-10-12T01:00:00+00:00";
const row = {
  event_id: eventId, venue_name: "Community tennis court", city: "Beijing",
  event_version: 2, created_at: createdAt, verification_status: "not_verified",
};
let handler;
let rpcResult = { data: { items: [row], next_cursor: null }, error: null };
let lastArgs;
let authError = null;
let envAvailable = true;
const client = {
  auth: { getUser: async (token) => token === "valid-token" ?
    { data: { user: { id: actor } }, error: authError } :
    { data: { user: null }, error: { message: "invalid JWT" } } },
  rpc: async (name, args) => {
    assert.equal(name, "platform_admin_list_event_venue_candidates");
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
  Response, Request, Date, Object, Number, JSON, String, Set,
}, { filename: "platform-admin-venue-candidates.transpiled.js" });
assert.equal(typeof handler, "function");
async function call(body, token = "valid-token", method = "POST") {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const req = new Request("https://example.invalid/platform-admin-venue-candidates", {
    method, headers, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  const res = await handler(req);
  return { status: res.status, body: res.status === 204 ? null : await res.json(), headers: res.headers };
}
assert.equal((await call({}, null)).status, 401);
assert.equal((await call({}, "expired-token")).status, 401);
assert.equal((await call({}, "valid-token", "GET")).status, 405);
assert.equal((await call({}, "valid-token", "OPTIONS")).status, 204);
for (const bad of [
  { actor_id: actor }, { p_actor_auth_user_id: actor }, { page_size: 0 }, { page_size: 51 },
  { page_size: 1.5 }, { before: { event_id: eventId } },
  { before: { created_at: createdAt, event_id: "invalid" } },
  { before: { created_at: createdAt, event_id: eventId, extra: "x" } },
]) assert.equal((await call(bad)).status, 400, JSON.stringify(bad));
assert.equal((await call("{")).status, 400);
assert.equal((await call({ padding: "x".repeat(3000) })).status, 413);
const success = await call({ page_size: 5 });
assert.equal(success.status, 200);
assert.equal(success.body.items.length, 1);
assert.equal(success.body.items[0].verification_status, "not_verified");
assert.equal(success.headers.get("cache-control"), "no-store");
assert.equal(lastArgs.p_actor_auth_user_id, actor);
assert.equal(lastArgs.p_page_size, 5);
assert.equal(lastArgs.p_before_event_id, null);
assert.equal((await call({ before: { created_at: createdAt, event_id: eventId } })).status, 200);
assert.equal(lastArgs.p_before_created_at, createdAt);
assert.equal(lastArgs.p_before_event_id, eventId);
rpcResult = { data: { items: [row], next_cursor: { created_at: createdAt, event_id: eventId } }, error: null };
assert.equal((await call({ page_size: 1 })).status, 200);
for (const invalid of [
  { ...row, venue_address: "private location" },
  { ...row, venue_latitude: 39.9 },
  { ...row, owner_user_id: actor },
  { ...row, verification_status: "verified" },
  { ...row, event_version: 0 },
  { ...row, venue_name: " " },
]) {
  rpcResult = { data: { items: [invalid], next_cursor: null }, error: null };
  assert.equal((await call({})).status, 503, `reject invalid row: ${JSON.stringify(invalid)}`);
}
rpcResult = { data: { items: [row], next_cursor: { created_at: createdAt, event_id: olderId } }, error: null };
assert.equal((await call({ page_size: 1 })).status, 503, "cursor must match final item");
rpcResult = { data: { items: [row, row], next_cursor: null }, error: null };
assert.equal((await call({})).status, 503, "duplicate event rejected");
rpcResult = { data: { items: [row, { ...row, event_id: olderId, created_at: "2026-10-13T01:00:00+00:00" }], next_cursor: null }, error: null };
assert.equal((await call({})).status, 503, "unsorted page rejected");
rpcResult = { data: null, error: { message: "PLATFORM_ADMIN_FORBIDDEN" } };
assert.equal((await call({})).status, 403, "revoked role denied");
rpcResult = { data: null, error: { message: "sensitive internal DB error" } };
assert.deepEqual((await call({})).body, { code: "VENUE_CANDIDATE_DIRECTORY_UNAVAILABLE" });
authError = { message: "expired" };
assert.equal((await call({})).status, 401);
authError = null;
envAvailable = false;
assert.equal((await call({})).status, 503);
console.log("V8 Platform Admin venue candidate Edge contract passed");
