import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import "./unit-v8-platform-admin-user-directory-ui.mjs";

const source = await readFile("supabase/functions/platform-admin-users/index.ts", "utf8");
assert.match(source, /client\.auth\.getUser\(token\)/, "Edge must validate JWT");
assert.match(source, /p_actor_auth_user_id:\s*user\.id/, "actor must come from verified auth identity");
assert.match(source, /client\.rpc\("platform_admin_list_users"/, "dedicated RPC only");
assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/, "user directory is read-only");
const runnable = source.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2\.112\.4";\n/, "");
assert.notEqual(runnable, source, "test must remove exactly the Deno npm import");
const compiled = ts.transpileModule(runnable, {
  fileName: "platform-admin-users.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "Edge TypeScript must transpile");

let handler;
let calls = [];
let authUser = { id: "b3333333-3333-4333-8333-333333333333" };
let authError = null;
let rpcError = null;
let serviceAvailable = true;
const boundaryRow = { id: "b6666666-6666-4666-8666-666666666661", nickname: "Player A", profile_status: "completed", created_at: "2026-10-11T13:00:00.000000+00:00" };
const cursor = { created_at: boundaryRow.created_at, id: boundaryRow.id };
const olderRow = { ...boundaryRow, id: "b6666666-6666-4666-8666-666666666662", created_at: "2026-10-11T12:59:59.999999+00:00" };
let rpcData = { items: [olderRow], next_cursor: { created_at: olderRow.created_at, id: olderRow.id } };
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
assert.equal(typeof handler, "function");
const endpoint = "https://example.invalid/functions/v1/platform-admin-users";
const send = async (body = {}, token = "valid-jwt", method = "POST") => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const req = new Request(endpoint, { method, headers, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
  const res = await handler(req);
  return { status: res.status, data: res.status === 204 ? null : await res.json(), headers: res.headers };
};

let res = await send({ page_size: 1, before: cursor });
assert.equal(res.status, 200);
assert.equal(res.headers.get("Cache-Control"), "no-store");
assert.deepEqual(res.data, rpcData);
assert.equal(calls[0].token, "valid-jwt");
assert.equal(calls[1].name, "platform_admin_list_users");
assert.equal(calls[1].args.p_actor_auth_user_id, authUser.id);
assert.equal(calls[1].args.p_page_size, 1);
assert.equal(calls[1].args.p_before_created_at, cursor.created_at);
assert.equal(calls[1].args.p_before_id, cursor.id);

rpcData = { items: [boundaryRow], next_cursor: null };
assert.equal((await send({ page_size: 1, before: cursor })).status, 503, "cursor-boundary row must fail closed");
rpcData = { items: [olderRow], next_cursor: null };
assert.equal((await send({ page_size: 1, before: cursor })).status, 200);

const fullPage = Array.from({ length: 20 }, (_, index) => ({
  ...boundaryRow,
  id: `${String(index + 1).padStart(8, "0")}-6666-4666-8666-666666666666`,
  created_at: `2026-10-10T${String(23 - index).padStart(2, "0")}:00:00.000000+00:00`,
}));
rpcData = { items: fullPage, next_cursor: { created_at: fullPage[19].created_at, id: fullPage[19].id } };
assert.equal((await send()).status, 200);
assert.equal(calls.at(-1).args.p_page_size, 20);
rpcData = { items: [olderRow], next_cursor: { created_at: olderRow.created_at, id: olderRow.id } };
assert.equal((await send()).status, 503, "short page must not emit a next cursor");

rpcData = { items: [olderRow], next_cursor: null };
assert.equal((await send({}, null)).status, 401);
assert.equal((await send({}, "valid-jwt", "GET")).status, 405);
assert.equal((await send({}, "valid-jwt", "OPTIONS")).status, 204);
for (const invalid of ["bad-json", { page_size: 0 }, { page_size: 51 }, { page_size: 1.5 },
  { actor_auth_user_id: authUser.id }, { role: "super_admin" },
  { before: { created_at: cursor.created_at } }, { before: { ...cursor, extra: true } },
  { before: { ...cursor, id: "not-a-uuid" } }, { before: { ...cursor, created_at: "2026-10-11" } }]) {
  assert.equal((await send(invalid)).status, 400, `invalid input must fail: ${JSON.stringify(invalid)}`);
}
assert.equal((await send({ extra: "x".repeat(2049) })).status, 413);
authError = { message: "expired" };
assert.equal((await send()).status, 401);
authError = null;
authUser = null;
assert.equal((await send()).status, 401);
authUser = { id: "b3333333-3333-4333-8333-333333333333" };
rpcError = { message: "PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN" };
res = await send();
assert.equal(res.status, 403);
assert.equal(res.data.code, "PLATFORM_ADMIN_FORBIDDEN");
rpcError = { message: "private SQL stack and secret" };
res = await send();
assert.equal(res.status, 503);
assert.equal(res.data.code, "USER_DIRECTORY_UNAVAILABLE");
assert.doesNotMatch(JSON.stringify(res.data), /SQL stack|secret/);
rpcError = null;
for (const invalidPage of [
  { items: [{ ...olderRow, email: "secret@example.invalid" }], next_cursor: null },
  { items: [olderRow, olderRow], next_cursor: null },
  { items: [{ ...olderRow, id: "bad" }], next_cursor: null },
  { items: [olderRow], next_cursor: { created_at: olderRow.created_at, id: olderRow.id, actor_id: authUser.id } },
  { items: [], next_cursor: cursor },
  { items: [olderRow], next_cursor: { created_at: "bad", id: olderRow.id } },
  { unexpected: "raw" },
]) {
  rpcData = invalidPage;
  assert.equal((await send({ page_size: 1 })).status, 503, `invalid RPC response must fail closed: ${JSON.stringify(invalidPage)}`);
}
rpcData = { items: [olderRow], next_cursor: null };
serviceAvailable = false;
assert.equal((await send()).status, 503);
console.log("V8 Platform Admin users Edge route tests passed");
