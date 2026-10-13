import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile("supabase/functions/platform-admin-audit/index.ts", "utf8");
assert.match(source, /client\.auth\.getUser\(token\)/, "JWT must be verified by Edge");
assert.match(source, /p_actor_auth_user_id: user\.id/, "actor must be derived from verified JWT");
assert.match(source, /client\.rpc\("platform_admin_list_audit"/, "only dedicated audit RPC may be called");
assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/, "audit route must remain read-only");
assert.doesNotMatch(source, /p_actor_auth_user_id: (?:query|body|cmd)\./, "client must not select audit actor");

// Execute the real request handler with a mocked Supabase boundary, rather than
// relying on source-text checks alone. The Deno npm import is injected in VM.
const runnable = source.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2\.112\.4";\n/, "");
assert.notEqual(runnable, source, "test must remove exactly the known Deno import");
const compiled = ts.transpileModule(runnable, {
  fileName: "platform-admin-audit.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "Edge TypeScript must transpile");
let handler;
let calls = [];
let authUser = { id: "a1111111-1111-4111-8111-111111111111" };
let authError = null;
let rpcError = null;
let rpcData = { items: [{ action: "REPORT_RESOLVE" }], next_cursor: null };
let serviceAvailable = true;
const mockClient = {
  auth: { getUser: async (token) => {
    calls.push({ method: "auth", token });
    return { data: { user: authUser }, error: authError };
  } },
  rpc: async (name, args) => {
    calls.push({ method: "rpc", name, args });
    return { data: rpcData, error: rpcError };
  },
};
vm.runInNewContext(compiled.outputText, {
  createClient: () => mockClient,
  Deno: {
    serve: (fn) => { handler = fn; },
    env: { get: (name) => serviceAvailable ? (name === "SUPABASE_URL" ? "https://example.invalid" : "server-only-secret") : undefined },
  },
  Request, Response, Date, Object, Number, Array, JSON, String,
});
assert.equal(typeof handler, "function", "Deno must register the request handler");
const endpoint = "https://example.invalid/functions/v1/platform-admin-audit";
const send = async (body = {}, token = "valid-jwt", method = "POST") => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const req = new Request(endpoint, {
    method,
    headers,
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  const res = await handler(req);
  return { status: res.status, data: res.status === 204 ? null : await res.json(), headers: res.headers };
};
const cursor = { created_at: "2026-10-11T13:00:00+00:00", id: "a5555555-5555-4555-8555-555555555551" };
let res = await send({ page_size: 10, before: cursor });
assert.equal(res.status, 200);
assert.equal(res.headers.get("Cache-Control"), "no-store");
assert.equal(calls[0].token, "valid-jwt");
assert.equal(calls[1].name, "platform_admin_list_audit");
assert.equal(calls[1].args.p_actor_auth_user_id, authUser.id);
assert.equal(calls[1].args.p_page_size, 10);
assert.equal(calls[1].args.p_before_created_at, cursor.created_at);
assert.equal(calls[1].args.p_before_id, cursor.id);
assert.equal((await send({}, "valid-jwt")).status, 200);
assert.equal(calls.at(-1).args.p_page_size, 25);
assert.equal((await send({}, null)).status, 401);
assert.equal((await send({}, "valid-jwt", "GET")).status, 405);
assert.equal((await send({}, "valid-jwt", "OPTIONS")).status, 204);
assert.equal((await send("not-json")).status, 400);
assert.equal((await send({ page_size: 51 })).status, 400);
assert.equal((await send({ page_size: 1.5 })).status, 400);
assert.equal((await send({ actor_auth_user_id: authUser.id })).status, 400);
assert.equal((await send({ before: { created_at: cursor.created_at } })).status, 400);
assert.equal((await send({ before: { ...cursor, extra: true } })).status, 400);
assert.equal((await send({ before: { ...cursor, id: "bad" } })).status, 400);
assert.equal((await send({ before: { ...cursor, created_at: "2026-10-11" } })).status, 400);
assert.equal((await send({ junk: "x".repeat(2049) })).status, 413);
authError = { message: "expired" };
assert.equal((await send()).status, 401);
authError = null;
rpcError = { message: "PLATFORM_ADMIN_FORBIDDEN" };
res = await send();
assert.equal(res.status, 403, "role revocation must fail closed");
assert.equal(res.data.code, "PLATFORM_ADMIN_FORBIDDEN");
rpcError = { message: "internal SQL details and private key" };
res = await send();
assert.equal(res.status, 503);
assert.equal(res.data.code, "AUDIT_READ_UNAVAILABLE");
assert.doesNotMatch(JSON.stringify(res.data), /private key|SQL details/);
rpcError = null;
rpcData = { unexpected: "raw" };
assert.equal((await send()).status, 503, "malformed RPC response must fail closed");
rpcData = { items: [], next_cursor: null };
serviceAvailable = false;
assert.equal((await send()).status, 503, "missing server credentials must fail closed");
console.log("V8 Platform Admin audit Edge route tests passed");
