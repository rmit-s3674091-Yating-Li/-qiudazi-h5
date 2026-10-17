import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile("supabase/functions/platform-admin-photos/index.ts", "utf8");
assert.match(source, /client\.auth\.getUser\(token\)/, "JWT must be verified at Edge");
assert.match(source, /p_actor_auth_user_id:\s*user\.id/, "actor comes only from verified JWT");
assert.match(source, /client\.rpc\("platform_admin_list_event_photo_metadata"/, "dedicated service-only RPC");
assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/, "no photo mutations");
const runnable = source.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2\.112\.4";\n/, "");
assert.notEqual(runnable, source, "recognize Deno npm import exactly");
const compiled = ts.transpileModule(runnable, {
  fileName: "platform-admin-photos.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "Edge TypeScript syntax");

const actor = "a1111111-1111-4111-8111-111111111111";
const event = "b1111111-1111-4111-8111-111111111111";
const other = "c1111111-1111-4111-8111-111111111111";
const photo = "d1111111-1111-4111-8111-111111111111";
const uploaded = "2026-10-13T09:00:00.000000+00:00";
const row = { id: photo, event_id: event, version: 1, uploaded_at: uploaded };
const olderRow = { ...row, id: "d2222222-2222-4222-8222-222222222222", uploaded_at: "2026-10-13T08:59:59.999999+00:00" };
let handler;
let rpcResult = { data: { items: [row], next_cursor: null }, error: null };
let lastArgs;
let envAvailable = true;
let authError = null;
const client = {
  auth: { getUser: async (token) => token === "valid-token" ?
    { data: { user: { id: actor } }, error: authError } :
    { data: { user: null }, error: { message: "invalid jwt" } } },
  rpc: async (name, args) => {
    assert.equal(name, "platform_admin_list_event_photo_metadata");
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
  Response, Request, Date, Object, Number, JSON, String, BigInt, Set,
}, { filename: "platform-admin-photos.transpiled.js" });
assert.equal(typeof handler, "function");
async function call(body, token = "valid-token", method = "POST") {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const req = new Request("https://example.invalid/platform-admin-photos", {
    method, headers, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  const res = await handler(req);
  return { status: res.status, body: res.status === 204 ? null : await res.json(), headers: res.headers };
}

assert.equal((await call({ event_id: event }, null)).status, 401);
assert.equal((await call({ event_id: event }, "expired-token")).status, 401);
assert.equal((await call({ event_id: event }, "valid-token", "GET")).status, 405);
assert.equal((await call({}, "valid-token", "OPTIONS")).status, 204);
for (const bad of [{}, { actor_id: actor, event_id: event }, { event_id: "invalid" },
  { event_id: event, page_size: 0 }, { event_id: event, page_size: 51 },
  { event_id: event, page_size: 1.5 }, { event_id: event, before: { id: photo } },
  { event_id: event, before: { uploaded_at: uploaded, id: "bad" } },
  { event_id: event, before: { uploaded_at: uploaded, id: photo, extra: "bad" } }]) {
  assert.equal((await call(bad)).status, 400, JSON.stringify(bad));
}
assert.equal((await call("{")).status, 400);
assert.equal((await call("x".repeat(2049))).status, 413);

let res = await call({ event_id: event });
assert.equal(res.status, 200);
assert.equal(res.headers.get("Cache-Control"), "no-store");
assert.deepEqual(res.body, { items: [row], next_cursor: null });
assert.deepEqual(JSON.parse(JSON.stringify(lastArgs)), {
  p_actor_auth_user_id: actor, p_event_id: event, p_page_size: 20,
  p_before_uploaded_at: null, p_before_id: null,
});

rpcResult = { data: { items: [row], next_cursor: null }, error: null };
res = await call({ event_id: event, page_size: 1, before: { uploaded_at: uploaded, id: photo } });
assert.equal(res.status, 503, "cursor-boundary photo must fail closed");
rpcResult = { data: { items: [olderRow], next_cursor: null }, error: null };
res = await call({ event_id: event, page_size: 1, before: { uploaded_at: uploaded, id: photo } });
assert.equal(res.status, 200);
assert.equal(lastArgs.p_before_id, photo);
assert.equal(lastArgs.p_before_uploaded_at, uploaded);

rpcResult = { data: { items: [olderRow], next_cursor: { uploaded_at: olderRow.uploaded_at, id: olderRow.id } }, error: null };
assert.equal((await call({ event_id: event, page_size: 2 })).status, 503, "short page must not emit next cursor");
rpcResult = { data: { items: [row], next_cursor: { uploaded_at: uploaded, id: photo } }, error: null };
assert.equal((await call({ event_id: event, page_size: 1 })).status, 200);

const invalidPages = [
  { items: [{ ...row, original_url: "private/photo" }], next_cursor: null },
  { items: [{ ...row, signed_url: "secret" }], next_cursor: null },
  { items: [{ ...row, event_id: other }], next_cursor: null },
  { items: [{ ...row, version: -1 }], next_cursor: null },
  { items: [{ ...row, uploaded_at: "not a date" }], next_cursor: null },
  { items: [row], next_cursor: { uploaded_at: uploaded, id: other } },
  { items: [row], next_cursor: { uploaded_at: uploaded } },
  { items: [row], next_cursor: null, debug: "private" },
  { items: [], next_cursor: { uploaded_at: uploaded, id: photo } },
  { items: [row, row], next_cursor: null },
];
for (const bad of invalidPages) {
  rpcResult = { data: bad, error: null };
  res = await call({ event_id: event, page_size: 1 });
  assert.equal(res.status, 503, JSON.stringify(bad));
  assert.deepEqual(res.body, { code: "PHOTO_DIRECTORY_UNAVAILABLE" });
}

rpcResult = { data: null, error: { message: "PLATFORM_ADMIN_FORBIDDEN" } };
assert.equal((await call({ event_id: event })).status, 403);
rpcResult = { data: null, error: { message: "internal SQL error: secret" } };
res = await call({ event_id: event });
assert.equal(res.status, 503);
assert.doesNotMatch(JSON.stringify(res.body), /secret|SQL/i);
rpcResult = { data: { items: [row], next_cursor: null }, error: null };
authError = { message: "expired" };
assert.equal((await call({ event_id: event })).status, 401);
authError = null;
envAvailable = false;
assert.equal((await call({ event_id: event })).status, 503);
console.log("PASS: V8 Platform Admin photo metadata Edge authorization/shape/contract");
