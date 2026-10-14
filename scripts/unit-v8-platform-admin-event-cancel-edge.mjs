import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync("supabase/functions/platform-admin-event-cancel/index.ts", "utf8");
assert.match(source, /client\.auth\.getUser\(token\)/);
assert.match(source, /p_actor_auth_user_id: user\.id/);
assert.match(source, /client\.rpc\("platform_admin_cancel_unstarted_event"/);
assert.doesNotMatch(source, /p_actor_auth_user_id: (?:command|body|req)\./);
assert.doesNotMatch(source, /client\.from\(|client\.insert\(|client\.update\(|client\.delete\(|client\.upsert\(/);
const stripped = source.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2\.112\.4";\n/, "");
assert.notEqual(stripped, source);
const compiled = ts.transpileModule(stripped, {
  fileName: "platform-admin-event-cancel.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
let handler;
let calls = [];
let authUser = { id: "a1111111-1111-4111-8111-111111111111" };
let authError = null;
let rpcError = null;
let rpcData = { id: "b1111111-1111-4111-8111-111111111111", status: "cancelled", version: 3,
  cancelled_at: "2026-10-13T00:00:00Z", replayed: false };
let serviceAvailable = true;
const client = {
  auth: { getUser: async (token) => { calls.push({ kind: "auth", token });
    return { data: { user: authUser }, error: authError }; } },
  rpc: async (name, args) => { calls.push({ kind: "rpc", name, args });
    return { data: rpcData, error: rpcError }; },
};
vm.runInNewContext(compiled.outputText, {
  createClient: () => client,
  Deno: { serve: (fn) => { handler = fn; }, env: { get: (name) => serviceAvailable ?
    (name === "SUPABASE_URL" ? "https://example.invalid" : "server-secret") : undefined } },
  Request, Response, Date, Object, Number, Array, JSON, String,
});
assert.equal(typeof handler, "function");
const command = {
  event_id: rpcData.id,
  expected_version: 2,
  request_id: "c1111111-1111-4111-8111-111111111111",
  reason: "Confirmed event policy violation",
  confirmed: true,
};
const send = async (body = command, token = "valid-jwt", method = "POST") => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await handler(new Request("https://example.invalid/functions/v1/platform-admin-event-cancel", {
    method, headers,
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  }));
  return { status: res.status, data: res.status === 204 ? null : await res.json(), headers: res.headers };
};
let res = await send();
assert.equal(res.status, 200);
assert.equal(res.data.status, "cancelled");
assert.equal(res.headers.get("Cache-Control"), "no-store");
assert.equal(calls[0].token, "valid-jwt");
assert.equal(calls[1].name, "platform_admin_cancel_unstarted_event");
assert.equal(calls[1].args.p_actor_auth_user_id, authUser.id);
assert.equal(calls[1].args.p_event_id, command.event_id);
assert.equal(calls[1].args.p_expected_version, 2);
assert.equal(calls[1].args.p_request_id, command.request_id);
assert.equal(calls[1].args.p_reason, command.reason);
rpcData = { ...rpcData, replayed: true };
res = await send();
assert.equal(res.status, 200);
assert.equal(res.data.replayed, true);
assert.equal((await send(command, null)).status, 401);
assert.equal((await send(command, "valid-jwt", "GET")).status, 405);
assert.equal((await send(command, "valid-jwt", "OPTIONS")).status, 204);
assert.equal((await send("not-json")).status, 400);
for (const bad of [
  { ...command, confirmed: false },
  { ...command, confirmed: "true" },
  { ...command, expected_version: 0 },
  { ...command, expected_version: 1.5 },
  { ...command, event_id: "bad" },
  { ...command, request_id: "bad" },
  { ...command, reason: "short" },
  { ...command, actor_auth_user_id: authUser.id },
  { ...command, role: "super_admin" },
]) {
  const before = calls.length;
  assert.equal((await send(bad)).status, 400);
  assert.equal(calls.length, before, "invalid requests must not call Auth or RPC");
}
assert.equal((await send("x".repeat(4097))).status, 413);
authError = { message: "expired" };
assert.equal((await send()).status, 401);
authError = null;
for (const [errorCode, status, publicCode] of [
  ["PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN", 403, "PLATFORM_ADMIN_FORBIDDEN"],
  ["EVENT_NOT_FOUND", 404, "EVENT_NOT_FOUND"],
  ["VERSION_CONFLICT", 409, "VERSION_CONFLICT"],
  ["ADMIN_REQUEST_CONFLICT", 409, "ADMIN_REQUEST_CONFLICT"],
  ["ADMIN_EVENT_CANCEL_STATE", 409, "EVENT_CANCEL_STATE_CONFLICT"],
  ["ADMIN_EVENT_CANCEL_STARTED", 409, "EVENT_ALREADY_STARTED"],
]) {
  rpcError = { message: errorCode };
  res = await send();
  assert.equal(res.status, status);
  assert.equal(res.data.code, publicCode);
}
rpcError = { message: "private SQL internals secret" };
res = await send();
assert.equal(res.status, 503);
assert.doesNotMatch(JSON.stringify(res.data), /private|secret|SQL/);
rpcError = null;
rpcData = { ...rpcData, id: "wrong-id" };
assert.equal((await send()).status, 503);
rpcData = { ...rpcData, id: command.event_id };
serviceAvailable = false;
assert.equal((await send()).status, 503);
console.log("V8 Platform Admin event-cancel Edge route tests passed");
