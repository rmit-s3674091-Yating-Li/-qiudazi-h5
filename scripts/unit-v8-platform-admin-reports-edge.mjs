import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile("supabase/functions/platform-admin-reports/index.ts", "utf8");
assert.match(source, /client\.auth\.getUser\(token\)/, "JWT verification is mandatory");
assert.match(source, /p_actor_auth_user_id: user\.id/, "actor must derive from verified JWT");
assert.match(source, /client\.rpc\("platform_admin_list_reports"/, "dedicated service-role RPC");
assert.doesNotMatch(source, /\.(insert|update|delete|upsert|storage)\b/, "Edge must be metadata-only");
const runnable = source.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2\.112\.4";\n/, "");
assert.notEqual(runnable, source, "Deno import recognized");
const compiled = ts.transpileModule(runnable, {
  fileName: "platform-admin-reports.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "Edge TypeScript syntax");

const actor = "a1111111-1111-4111-8111-111111111111";
const report = "b1111111-1111-4111-8111-111111111111";
const older = "b1111111-1111-4111-8111-111111111110";
const target = "c1111111-1111-4111-8111-111111111111";
const created = "2026-10-14T00:00:00+00:00";
const row = { id: report, target_kind: "event", target_id: target,
  category: "safety", status: "open", version: 1, created_at: created };
let handler;
let rpcResult = { data: { items: [row], next_cursor: null }, error: null };
let lastArgs;
let authError = null;
let envAvailable = true;
const client = {
  auth: { getUser: async (token) => token === "valid-token" ?
    { data: { user: { id: actor } }, error: authError } :
    { data: { user: null }, error: { message: "invalid token" } } },
  rpc: async (name, args) => {
    assert.equal(name, "platform_admin_list_reports");
    lastArgs = args;
    return rpcResult;
  },
};
vm.runInNewContext(compiled.outputText, {
  createClient: () => client,
  Deno: { serve: (fn) => { handler = fn; },
    env: { get: (name) => envAvailable ? (name === "SUPABASE_URL" ? "https://example.invalid" : "secret") : null } },
  Response, Request, Date, Object, Number, JSON, String, Set,
}, { filename: "platform-admin-reports.transpiled.js" });
assert.equal(typeof handler, "function");
async function call(body, token = "valid-token", method = "POST") {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const req = new Request("https://example.invalid/platform-admin-reports", {
    method, headers, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  const res = await handler(req);
  return { status: res.status, body: res.status === 204 ? null : await res.json(), headers: res.headers };
}
assert.equal((await call({}, null)).status, 401);
assert.equal((await call({}, "expired-token")).status, 401);
assert.equal((await call({}, "valid-token", "GET")).status, 405);
assert.equal((await call({}, "valid-token", "OPTIONS")).status, 204);
for (const bad of [{ actor_id: actor }, { role: "super_admin" }, { page_size: 0 },
  { page_size: 51 }, { page_size: 1.5 }, { status: "all" },
  { before: { id: report } }, { before: { created_at: created, id: "invalid" } },
  { before: { created_at: created, id: report, actor: actor } }]) {
  assert.equal((await call(bad)).status, 400, JSON.stringify(bad));
}
assert.equal((await call("{")).status, 400);
assert.equal((await call("x".repeat(2049))).status, 413);
let res = await call({});
assert.equal(res.status, 200);
assert.equal(res.headers.get("Cache-Control"), "no-store");
assert.deepEqual(res.body, { items: [row], next_cursor: null });
assert.deepEqual(JSON.parse(JSON.stringify(lastArgs)), {
  p_actor_auth_user_id: actor, p_page_size: 20, p_before_created_at: null,
  p_before_id: null, p_status: null,
});
res = await call({ status: "open", page_size: 1, before: { created_at: "2026-10-15T00:00:00+00:00", id: older } });
assert.equal(res.status, 200);
assert.equal(lastArgs.p_status, "open");
assert.equal(lastArgs.p_before_id, older);

const invalidPages = [
  { items: [{ ...row, summary: "private narrative" }], next_cursor: null },
  { items: [{ ...row, reporter_auth_user_id: actor }], next_cursor: null },
  { items: [{ ...row, status: "unknown" }], next_cursor: null },
  { items: [{ ...row, version: 0 }], next_cursor: null },
  { items: [{ ...row, created_at: "bad" }], next_cursor: null },
  { items: [{ ...row, target_kind: "admin" }], next_cursor: null },
  { items: [row], next_cursor: { created_at: created, id: older } },
  { items: [row], next_cursor: { created_at: created } },
  { items: [row], next_cursor: null, internal: "secret" },
  { items: [], next_cursor: { created_at: created, id: report } },
  { items: [row, row], next_cursor: null },
  { items: [row, { ...row, id: older, created_at: "2026-10-15T00:00:00+00:00" }], next_cursor: null },
];
for (const bad of invalidPages) {
  rpcResult = { data: bad, error: null };
  res = await call({ page_size: 1 });
  assert.equal(res.status, 503, JSON.stringify(bad));
  assert.deepEqual(res.body, { code: "REPORT_DIRECTORY_UNAVAILABLE" });
}
rpcResult = { data: { items: [row], next_cursor: null }, error: null };
rpcResult = { data: { items: [row], next_cursor: { created_at: created, id: report } }, error: null };
assert.equal((await call({ page_size: 1 })).status, 200);
rpcResult = { data: { items: [row], next_cursor: null }, error: null };
res = await call({ status: "resolved" });
assert.equal(res.status, 503, "status-filter mismatch fails closed");
rpcResult = { data: null, error: { message: "PLATFORM_ADMIN_FORBIDDEN" } };
assert.equal((await call({})).status, 403);
rpcResult = { data: null, error: { message: "internal SQL secret" } };
res = await call({});
assert.equal(res.status, 503);
assert.doesNotMatch(JSON.stringify(res.body), /SQL|secret/i);
rpcResult = { data: { items: [row], next_cursor: null }, error: null };
authError = { message: "revoked" };
assert.equal((await call({})).status, 401);
authError = null;
envAvailable = false;
assert.equal((await call({})).status, 503);
console.log("PASS: V8 Platform Admin reports Edge JWT/authorization/pagination/data minimization");
