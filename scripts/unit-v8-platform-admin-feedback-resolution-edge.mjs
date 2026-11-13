import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile("supabase/functions/platform-admin-feedback-resolution/index.ts", "utf8");
assert.match(source, /client\.auth\.getUser\(token\)/, "JWT must be verified by trusted Edge");
assert.match(source, /p_actor_auth_user_id: user\.id/, "actor must derive from verified JWT");
assert.match(source, /client\.rpc\("platform_admin_resolve_feedback"/, "only dedicated audited transaction");
assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/, "Edge must not split business and audit writes");
const runnable = source.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2\.112\.4";\n/, "");
assert.notEqual(runnable, source, "recognized exact Deno import");
const compiled = ts.transpileModule(runnable, {
  fileName: "platform-admin-feedback-resolution.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "Edge TypeScript syntax");
const actor = "a1111111-1111-4111-8111-111111111111";
const feedback = "b1111111-1111-4111-8111-111111111111";
const requestId = "c1111111-1111-4111-8111-111111111111";
const input = { feedback_id: feedback, expected_version: 4, decision: "resolved",
  reason: "Verified the evidence", request_id: requestId, confirmed: true };
let handler;
let rpcArgs;
let rpcCalls = 0;
let authCalls = 0;
let authError = null;
let envAvailable = true;
let rpcResult = { data: { request_id: requestId, feedback_id: feedback, status: "resolved", version: 5, replayed: false }, error: null };
const client = {
  auth: { getUser: async (token) => {
    authCalls++;
    return token === "good" ? { data: { user: { id: actor } }, error: authError } :
      { data: { user: null }, error: { message: "invalid token", status: 401 } };
  } },
  rpc: async (name, args) => {
    assert.equal(name, "platform_admin_resolve_feedback");
    rpcCalls++;
    rpcArgs = args;
    return rpcResult;
  },
};
vm.runInNewContext(compiled.outputText, {
  createClient: () => client,
  Deno: { serve: (fn) => { handler = fn; }, env: { get: (name) => envAvailable ?
    (name === "SUPABASE_URL" ? "https://example.invalid" : "secret") : null } },
  Response, Request, Date, Object, Number, JSON, String, Array,
}, { filename: "platform-admin-feedback-resolution.transpiled.js" });
assert.equal(typeof handler, "function");
async function call(body = input, token = "good", method = "POST") {
  const req = new Request("https://example.invalid/platform-admin-feedback-resolution", {
    method, headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  const response = await handler(req);
  return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
}
assert.equal((await call(input, null)).status, 401);
assert.equal((await call(input, "bad")).status, 401);
assert.equal((await call(input, "good", "GET")).status, 405);
assert.equal((await call({}, "good", "OPTIONS")).status, 204);
for (const bad of [
  {}, { ...input, confirmed: false }, { ...input, actor_id: actor },
  { ...input, feedback_id: "not-uuid" }, { ...input, actor_auth_user_id: actor },
  { ...input, role: "super_admin" }, { ...input, confirmed: "true" }, { ...input, request_id: "not-uuid" },
  { ...input, expected_version: 0 }, { ...input, expected_version: 1.2 },
  { ...input, expected_version: 2147483647 }, { ...input, decision: "open" },
  { ...input, reason: "too short" }, { ...input, reason: "x".repeat(1001) },
  { ...input, reason: "   " }, { ...input, reason: " ".repeat(10) },
]) {
  const before = rpcCalls;
  assert.equal((await call(bad)).status, 400, JSON.stringify(bad).slice(0, 100));
  assert.equal(rpcCalls, before, "invalid requests never reach RPC");
}
assert.equal((await call("{")).status, 400);
assert.equal((await call("x".repeat(4097))).status, 413);
let res = await call();
assert.equal(res.status, 200);
assert.equal(res.headers.get("Cache-Control"), "no-store");
assert.deepEqual(res.body, rpcResult.data);
assert.deepEqual(JSON.parse(JSON.stringify(rpcArgs)), {
  p_actor_auth_user_id: actor, p_feedback_id: feedback, p_expected_version: 4,
  p_decision: "resolved", p_reason: "Verified the evidence", p_request_id: requestId,
});
rpcResult = { data: { ...rpcResult.data, replayed: true }, error: null };
assert.equal((await call()).body.replayed, true);
rpcResult = { data: { ...rpcResult.data, replayed: false }, error: null };
res = await call({ ...input, feedback_id: feedback.toUpperCase(), request_id: requestId.toUpperCase() });
assert.equal(res.status, 200);
assert.equal(rpcArgs.p_feedback_id, feedback);
assert.equal(rpcArgs.p_request_id, requestId);
for (const code of ["PLATFORM_ADMIN_FORBIDDEN", "FEEDBACK_NOT_FOUND", "STALE_FEEDBACK_VERSION",
  "FEEDBACK_ALREADY_FINAL", "FEEDBACK_RESOLUTION_REPLAY_MISMATCH", "FEEDBACK_RESOLUTION_REPLAY_STATE_CHANGED",
  "INVALID_FEEDBACK_RESOLUTION_REASON", "SQL_INTERNAL_SECRET"]) {
  rpcResult = { data: null, error: { message: code } };
  res = await call();
  assert.equal(res.status, code === "PLATFORM_ADMIN_FORBIDDEN" ? 403 : code === "FEEDBACK_NOT_FOUND" ? 404 :
    code.startsWith("STALE_") || code.startsWith("FEEDBACK_ALREADY") || code.startsWith("FEEDBACK_RESOLUTION_REPLAY") ? 409 :
    code.startsWith("INVALID_") ? 400 : 503);
  assert.doesNotMatch(JSON.stringify(res.body), /SECRET|SQL_INTERNAL/i);
}
for (const bad of [
  { request_id: requestId, feedback_id: feedback, status: "resolved", version: 5, replayed: false, submitter_auth_user_id: actor },
  { request_id: requestId, feedback_id: feedback, status: "resolved", version: 5, replayed: false, message: "private feedback" },
  { request_id: requestId, feedback_id: "c1111111-1111-4111-8111-111111111112", status: "resolved", version: 5, replayed: false },
  { request_id: "c1111111-1111-4111-8111-111111111112", feedback_id: feedback, status: "resolved", version: 5, replayed: false },
  { request_id: requestId, feedback_id: feedback, status: "dismissed", version: 5, replayed: false },
  { request_id: requestId, feedback_id: feedback, status: "resolved", version: 6, replayed: false },
  { request_id: requestId, feedback_id: feedback, status: "resolved", version: 5, replayed: "false" },
]) {
  rpcResult = { data: bad, error: null };
  res = await call();
  assert.equal(res.status, 503, JSON.stringify(bad));
}
rpcResult = { data: { request_id: requestId, feedback_id: feedback, status: "resolved", version: 5, replayed: false }, error: null };
authError = { message: "expired", status: 401 };
assert.equal((await call()).status, 401);
authError = null;
// Even if Auth unexpectedly includes a user object alongside an error,
// the mutation must not run until JWT verification succeeds.
for (const [status, expectedStatus, expectedCode] of [
  [400, 401, "AUTH_REQUIRED"],
  [401, 401, "AUTH_REQUIRED"],
  [403, 401, "AUTH_REQUIRED"],
  [422, 401, "AUTH_REQUIRED"],
  [429, 503, "AUTH_CHECK_UNAVAILABLE"],
  [500, 503, "AUTH_CHECK_UNAVAILABLE"],
  [503, 503, "AUTH_CHECK_UNAVAILABLE"],
  [undefined, 503, "AUTH_CHECK_UNAVAILABLE"],
]) {
  authError = { message: "auth service failed", status };
  const before = rpcCalls;
  const failed = await call();
  assert.equal(failed.status, expectedStatus);
  assert.equal(failed.body.code, expectedCode);
  assert.equal(rpcCalls, before, "Auth failures must not invoke the feedback mutation");
}
authError = null;
envAvailable = false;
assert.equal((await call()).status, 503);
assert.ok(authCalls > 0);
console.log("PASS: V8 Platform Admin feedback resolution Edge JWT/actor/atomic-RPC/replay/conflict contract");
