import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile("supabase/functions/platform-admin-photo-preview/index.ts", "utf8");
assert.match(source, /client\.auth\.getUser\(token\)/, "JWT must be validated by Supabase Auth");
assert.match(source, /p_actor_auth_user_id: user\.id/, "actor must come from verified JWT");
assert.match(source, /platform_admin_get_photo_preview_source/, "dedicated service-role-only RPC");
assert.match(source, /createSignedUrl\(path, previewTtlSeconds\)/, "only authorized path is signed");
assert.doesNotMatch(source, /\.(insert|update|delete|upsert|remove|upload)\(/, "preview route is read-only");
const runnable = source.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2\.112\.4";\n/, "");
assert.notEqual(runnable, source, "Deno import must match exactly");
const compiled = ts.transpileModule(runnable, {
  fileName: "platform-admin-photo-preview.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);

const actor = "a1111111-1111-4111-8111-111111111111";
const eventId = "b1111111-1111-4111-8111-111111111111";
const photoId = "c1111111-1111-4111-8111-111111111111";
const path = "owner/event/watermarked-preview.jpg";
const signedUrl = `https://example.invalid/storage/v1/object/sign/event-photos/${path}?token=signed`;
let handler;
let calls = [];
let authUser = { id: actor };
let authError = null;
let rpcError = null;
let rpcData = { event_id: eventId, photo_id: photoId, version: 3, watermarked_path: path };
let signError = null;
let signedResult = { signedUrl };
let envAvailable = true;
const client = {
  auth: { getUser: async (token) => {
    calls.push({ kind: "auth", token });
    return { data: { user: authUser }, error: authError };
  } },
  rpc: async (name, args) => {
    calls.push({ kind: "rpc", name, args });
    return { data: rpcData, error: rpcError };
  },
  storage: { from: (bucket) => {
    calls.push({ kind: "bucket", bucket });
    return { createSignedUrl: async (key, ttl) => {
      calls.push({ kind: "sign", key, ttl });
      return { data: signedResult, error: signError };
    } };
  } },
};
vm.runInNewContext(compiled.outputText, {
  createClient: () => client,
  Deno: {
    serve: (fn) => { handler = fn; },
    env: { get: (name) => envAvailable ? (name === "SUPABASE_URL" ? "https://example.invalid" : "secret") : undefined },
  },
  Request, Response, URL, Date, Object, Number, JSON, String,
}, { filename: "platform-admin-photo-preview.transpiled.js" });
assert.equal(typeof handler, "function");
async function send(body = { event_id: eventId, photo_id: photoId }, token = "valid-jwt", method = "POST") {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const req = new Request("https://example.invalid/functions/v1/platform-admin-photo-preview", {
    method, headers,
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  const res = await handler(req);
  return { status: res.status, body: res.status === 204 ? null : await res.json(), headers: res.headers };
}
const ok = await send();
assert.equal(ok.status, 200);
assert.equal(ok.headers.get("Cache-Control"), "no-store");
assert.deepEqual(ok.body, { url: signedUrl, expires_in: 60 });
assert.equal(calls[0].token, "valid-jwt");
assert.equal(calls[1].name, "platform_admin_get_photo_preview_source");
assert.equal(calls[1].args.p_actor_auth_user_id, actor);
assert.equal(calls[1].args.p_event_id, eventId);
assert.equal(calls[1].args.p_photo_id, photoId);
assert.equal(calls[2].bucket, "event-photos");
assert.equal(calls[3].key, path);
assert.equal(calls[3].ttl, 60);
assert.deepEqual(Object.keys(ok.body).sort(), ["expires_in", "url"]);
assert.doesNotMatch(JSON.stringify(Object.keys(ok.body)), /watermarked_path|original|actor|secret/);
for (const bad of [null, {}, [], { event_id: eventId }, { photo_id: photoId },
  { event_id: "not-uuid", photo_id: photoId }, { event_id: eventId, photo_id: "not-uuid" },
  { event_id: eventId, photo_id: photoId, actor_id: actor },
  { event_id: eventId, photo_id: photoId, role: "super_admin" }]) {
  const before = calls.length;
  assert.equal((await send(bad)).status, 400, `reject invalid body: ${JSON.stringify(bad)}`);
  assert.equal(calls.length, before, "invalid body cannot reach service");
}
assert.equal((await send("{" )).status, 400);
assert.equal((await send({ pad: "x".repeat(2000) })).status, 413);
assert.equal((await send(undefined, null)).status, 401);
assert.equal((await send(undefined, "valid-jwt", "GET")).status, 405);
assert.equal((await send(undefined, "valid-jwt", "OPTIONS")).status, 204);
authError = { message: "expired" };
assert.equal((await send()).status, 401);
authError = null;
authUser = { id: "not-uuid" };
assert.equal((await send()).status, 401);
authUser = { id: actor };
rpcError = { message: "PLATFORM_ADMIN_FORBIDDEN" };
let result = await send();
assert.equal(result.status, 403);
assert.deepEqual(result.body, { code: "PLATFORM_ADMIN_FORBIDDEN" });
rpcError = { message: "PHOTO_NOT_FOUND" };
assert.equal((await send()).status, 404);
rpcError = { message: "PHOTO_PREVIEW_UNAVAILABLE" };
assert.equal((await send()).status, 404);
rpcError = { message: "internal database stack secret" };
result = await send();
assert.equal(result.status, 503);
assert.doesNotMatch(JSON.stringify(result.body), /stack|secret/);
rpcError = null;
for (const invalid of [
  { ...rpcData, event_id: "d1111111-1111-4111-8111-111111111111" },
  { ...rpcData, photo_id: "d1111111-1111-4111-8111-111111111111" },
  { ...rpcData, original_url: "private-original.jpg" },
  { ...rpcData, watermarked_path: "https://other.invalid/photo.jpg" },
  { ...rpcData, watermarked_path: "../original.jpg" },
  { ...rpcData, watermarked_path: "/original.jpg" },
  { ...rpcData, watermarked_path: "owner/%2e%2e/original.jpg" },
  { ...rpcData, watermarked_path: "owner//photo.jpg" },
  { ...rpcData, watermarked_path: "owner\\photo.jpg" },
  { ...rpcData, version: 0 },
]) {
  rpcData = invalid;
  const before = calls.filter((c) => c.kind === "sign").length;
  assert.equal((await send()).status, 503, `reject unsafe source: ${JSON.stringify(invalid)}`);
  assert.equal(calls.filter((c) => c.kind === "sign").length, before, "unsafe source must never be signed");
}
rpcData = { event_id: eventId, photo_id: photoId, version: 3, watermarked_path: path };
signError = { message: "private storage details" };
assert.equal((await send()).status, 503);
signError = null;
for (const unsafe of ["https://evil.invalid/storage/v1/object/sign/event-photos/a?token=x",
  "https://example.invalid/storage/v1/object/public/event-photos/a?token=x",
  "https://example.invalid/storage/v1/object/sign/other-bucket/a?token=x",
  "https://example.invalid/storage/v1/object/sign/event-photos/a",
  "http://example.invalid/storage/v1/object/sign/event-photos/a?token=x"]) {
  signedResult = { signedUrl: unsafe };
  assert.equal((await send()).status, 503, `reject unsafe signed URL: ${unsafe}`);
}
signedResult = { signedUrl };
envAvailable = false;
assert.equal((await send()).status, 503);
console.log("V8 Platform Admin photo preview Edge contract passed");
