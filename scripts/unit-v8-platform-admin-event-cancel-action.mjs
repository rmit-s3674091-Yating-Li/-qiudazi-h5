import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-admin-cancel-action-"));
try {
  const source = await readFile("src/domain/PlatformAdminEventCancel.ts", "utf8");
  const compiled = ts.transpileModule(source, { fileName: "PlatformAdminEventCancel.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, verbatimModuleSyntax: true },
    reportDiagnostics: true });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const path = join(tmp, "PlatformAdminEventCancel.mjs");
  await writeFile(path, compiled.outputText, "utf8");
  const { prepareAdminCancelRequest: prepare, parseAdminCancelResponse: parse, adminCancelFailure: failure } =
    await import(pathToFileURL(path).href);
  const event = { id: "a1111111-1111-4111-8111-111111111111", name: "Test event", status: "signup", version: 2 };
  const input = { role: "super_admin", event, reason: "  Serious rule violation  ",
    typedName: event.name, acknowledged: true, requestId: "b1111111-1111-4111-8111-111111111111" };
  const ok = prepare(input);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.command, { event_id: event.id, expected_version: 2, request_id: input.requestId,
    reason: "Serious rule violation", confirmed: true });
  assert.equal(prepare({ ...input, event: { ...event, status: "locked" } }).ok, true);
  for (const bad of [
    { role: "operator" }, { role: "reviewer" }, { role: null },
    { event: { ...event, status: "ongoing" } }, { event: { ...event, status: "finished" } },
    { event: { ...event, status: "cancelled" } }, { event: { ...event, version: 0 } },
    { event: { ...event, id: "invalid" } }, { reason: "short" }, { reason: "x".repeat(1001) },
    { typedName: "test event" }, { acknowledged: false }, { requestId: "invalid" },
  ]) assert.equal(prepare({ ...input, ...bad }).ok, false);
  assert.equal(prepare({ ...input, reason: "😀".repeat(10) }).ok, true);
  const response = { id: event.id, status: "cancelled", version: 3,
    cancelled_at: "2026-10-13T01:00:00Z", replayed: false };
  assert.deepEqual(parse(response, ok.command), response);
  assert.equal(parse({ ...response, replayed: true }, ok.command)?.replayed, true);
  for (const bad of [{ ...response, id: input.requestId }, { ...response, version: 2 },
    { ...response, status: "ongoing" }, { ...response, cancelled_at: "not-a-date" },
    { ...response, leaked_email: "secret@example.invalid" }, { ...response, replayed: "true" }]) {
    assert.equal(parse(bad, ok.command), null);
  }
  assert.equal(failure(503, "ADMIN_CANCEL_UNAVAILABLE"), "retry_same_request");
  assert.equal(failure(null, null), "retry_same_request");
  assert.equal(failure(409, "VERSION_CONFLICT"), "refresh_required");
  assert.equal(failure(403, "PLATFORM_ADMIN_FORBIDDEN"), "refresh_required");
  const ui = await readFile("src/components/PlatformAdminEventCancelAction.tsx", "utf8");
  const tsx = ts.transpileModule(ui, { fileName: "PlatformAdminEventCancelAction.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true });
  assert.equal(tsx.diagnostics?.length ?? 0, 0);
  assert.match(ui, /supabase\.functions\.invoke\("platform-admin-event-cancel", \{ body: command \}\)/);
  assert.match(ui, /attempt\.current = command/);
  assert.match(ui, /parseAdminCancelResponse\(data, command\)/);
  assert.match(ui, /disabled=\{busy \|\| !!attempt\.current \|\| succeeded\}/);
  assert.doesNotMatch(ui, /actor_auth_user_id|p_actor_auth_user_id|service_role/i);
  console.log("V8 Platform Admin event-cancel client preflight and retry tests passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
