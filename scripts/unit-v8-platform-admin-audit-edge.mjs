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
const cursor = { created_at: "2026-10-11T13:00:00+00:00", id: "a5555555-5555-4555-8555-555555555551" };
const auditRow = {
  id: "a4444444-4444-4444-8444-444444444444",
  actor_auth_user_id: authUser.id,
  action: "REPORT_RESOLVE",
  target_kind: "report",
  target_id: "b1111111-1111-4111-8111-111111111111",
  reason: "Resolved after authorized review",
  risk_level: "high",
  created_at: "2026-10-11T12:59:59.999999+00:00",
};
let rpcData = { items: [auditRow], next_cursor: null };
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
  Request, Response, Date, Object, Number, Array, JSON, String, BigInt, Set,
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

let res = await send({ page_size: 10, before: cursor });
assert.equal(res.status, 200);
assert.equal(res.data.items.length, 1);
assert.equal(res.headers.get("Cache-Control"), "no-store");
assert.equal(calls[0].token, "valid-jwt");
assert.equal(calls[1].name, "platform_admin_list_audit");
assert.equal(calls[1].args.p_actor_auth_user_id, authUser.id);
assert.equal(calls[1].args.p_page_size, 10);
assert.equal(calls[1].args.p_before_created_at, cursor.created_at);
assert.equal(calls[1].args.p_before_id, cursor.id);
assert.equal((await send({}, "valid-jwt")).status, 200);
assert.equal(calls.at(-1).args.p_page_size, 25);

rpcData = { items: [{ ...auditRow, id: cursor.id, created_at: cursor.created_at }], next_cursor: null };
assert.equal((await send({ page_size: 10, before: cursor })).status, 503, "cursor-boundary row must fail closed");
rpcData = { items: [auditRow], next_cursor: { created_at: auditRow.created_at, id: auditRow.id } };
assert.equal((await send({ page_size: 10, before: cursor })).status, 503, "short page must not emit a next cursor");
const fullPage = Array.from({ length: 10 }, (_, index) => ({
  ...auditRow,
  id: `${String(index + 1).padStart(8, "0")}-4444-4444-8444-444444444444`,
  created_at: `2026-10-11T12:${String(59 - index).padStart(2, "0")}:00.000000+00:00`,
}));
rpcData = { items: fullPage, next_cursor: { created_at: fullPage[9].created_at, id: fullPage[9].id } };
assert.equal((await send({ page_size: 10, before: cursor })).status, 200);

rpcData = { items: [auditRow], next_cursor: null };
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

const auditRpcCount = () => calls.filter((call) => call.method === "rpc").length;
const rpcCountBeforeAuthFailures = auditRpcCount();
for (const status of [400, 401, 403, 422]) {
  authError = { message: "invalid JWT", status };
  res = await send();
  assert.equal(res.status, 401, `invalid credentials status ${status}`);
  assert.equal(res.data.code, "AUTH_REQUIRED");
  assert.equal(auditRpcCount(), rpcCountBeforeAuthFailures, "invalid JWT cannot reach audit RPC");
}
for (const status of [429, 500, 502, 503, undefined]) {
  authError = { message: "Auth upstream unavailable", status };
  res = await send();
  assert.equal(res.status, 503, `Auth upstream status ${status}`);
  assert.equal(res.data.code, "AUTH_CHECK_UNAVAILABLE");
  assert.equal(auditRpcCount(), rpcCountBeforeAuthFailures, "Auth outage cannot reach audit RPC");
}
authError = null;
authUser = null;
res = await send();
assert.equal(res.status, 401, "missing verified user must fail closed");
assert.equal(auditRpcCount(), rpcCountBeforeAuthFailures);
authUser = { id: "not-a-uuid" };
res = await send();
assert.equal(res.status, 401, "malformed verified actor must fail closed");
assert.equal(auditRpcCount(), rpcCountBeforeAuthFailures);
authUser = { id: auditRow.actor_auth_user_id };
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
rpcData = { items: [{ ...auditRow, private_email: "secret@example.invalid" }], next_cursor: null };
assert.equal((await send()).status, 503, "overshared audit row must fail closed");
rpcData = { items: [], next_cursor: null };
serviceAvailable = false;
assert.equal((await send()).status, 503, "missing server credentials must fail closed");
console.log("V8 Platform Admin audit Edge route tests passed");
