import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-feedback-action-"));
try {
  const source = await readFile("src/domain/PlatformAdminFeedbackResolution.ts", "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: "PlatformAdminFeedbackResolution.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  const modulePath = join(tmp, "PlatformAdminFeedbackResolution.mjs");
  await writeFile(modulePath, transpiled.outputText, "utf8");
  const { makeFeedbackResolutionAttempt: make, parseFeedbackResolutionReceipt: parse, submitFeedbackResolution: submit } =
    await import(pathToFileURL(modulePath).href);
  const feedbackId = "a1111111-1111-4111-8111-111111111111";
  const requestId = "b1111111-1111-4111-8111-111111111111";
  const attempt = make({ feedbackId, version: 4, decision: "resolved", reason: "  Verified this report  ", requestId });
  assert.deepEqual(attempt, { feedback_id: feedbackId, expected_version: 4, decision: "resolved",
    reason: "Verified this report", request_id: requestId, confirmed: true });
  for (const input of [
    { feedbackId: "not-id", version: 4, decision: "resolved", reason: "long enough reason", requestId },
    { feedbackId, version: 0, decision: "resolved", reason: "long enough reason", requestId },
    { feedbackId, version: 2147483647, decision: "resolved", reason: "long enough reason", requestId },
    { feedbackId, version: 4, decision: "open", reason: "long enough reason", requestId },
    { feedbackId, version: 4, decision: "resolved", reason: "too short", requestId },
    { feedbackId, version: 4, decision: "resolved", reason: "a".repeat(1001), requestId },
    { feedbackId, version: 4, decision: "resolved", reason: "long enough reason", requestId: "invalid" },
  ]) assert.equal(make(input), null);
  const receipt = { feedback_id: feedbackId, request_id: requestId, status: "resolved", version: 5, replayed: false };
  assert.deepEqual(parse(receipt, attempt), receipt);
  for (const extra of [
    { ...receipt, message: "private" }, { ...receipt, submitter_auth_user_id: feedbackId },
    { ...receipt, status: "dismissed" }, { ...receipt, version: 4 },
    { ...receipt, replayed: "false" }, { ...receipt, request_id: feedbackId },
  ]) assert.equal(parse(extra, attempt), null, "reject overshared/mismatched receipts");
  let calls = 0;
  const ambiguous = async (name, { body }) => {
    assert.equal(name, "platform-admin-feedback-resolution");
    assert.strictEqual(body, attempt, "retry must preserve exact payload and request UUID");
    calls++;
    if (calls === 1) throw new Error("response lost after commit");
    return { data: { ...receipt, replayed: true }, error: null };
  };
  assert.deepEqual(await submit(ambiguous, attempt), { kind: "uncertain" });
  assert.deepEqual(await submit(ambiguous, attempt), { kind: "committed", receipt: { ...receipt, replayed: true } });
  assert.equal(calls, 2);
  for (const [status, kind] of [[401, "forbidden"], [403, "forbidden"], [404, "not_found"],
    [409, "conflict"], [400, "invalid"], [503, "uncertain"]]) {
    assert.deepEqual(await submit(async () => ({ data: null, error: { context: { status } } }), attempt), { kind });
  }
  // A terminal Edge JSON denial remains terminal even if HTTP status is missing.
  // Response.clone() must be used so the original error body remains readable.
  const edgeError = (code, status = null) => {
    const body = new Response(JSON.stringify({ code }), { status: 403 });
    return { context: {
      ...(status === null ? {} : { status }),
      clone: () => body.clone(),
    } };
  };
  for (const [code, kind] of [
    ["AUTH_REQUIRED", "forbidden"],
    ["PLATFORM_ADMIN_FORBIDDEN", "forbidden"],
    ["FEEDBACK_NOT_FOUND", "not_found"],
    ["FEEDBACK_CONFLICT", "conflict"],
    ["INVALID_FEEDBACK_RESOLUTION", "invalid"],
    ["METHOD_NOT_ALLOWED", "invalid"],
    ["SERVICE_UNAVAILABLE", "uncertain"],
    ["FEEDBACK_RESOLUTION_UNAVAILABLE", "uncertain"],
  ]) {
    for (const status of [null, 0]) {
      const error = edgeError(code, status);
      assert.deepEqual(await submit(async () => ({ data: null, error }), attempt), { kind },
        `${code} status=${status}`);
      assert.deepEqual(await error.context.clone().json(), { code }, "do not consume response body");
    }
  }
  for (const [status, kind] of [[405, "invalid"], [422, "invalid"],
    [408, "uncertain"], [429, "uncertain"], [503, "uncertain"]]) {
    assert.deepEqual(await submit(async () => ({ data: null, error: { context: { status } } }), attempt),
      { kind }, `HTTP ${status}`);
  }
  for (const context of [
    { clone: () => { throw new Error("clone failed"); } },
    { clone: () => ({ json: async () => { throw new Error("invalid JSON"); } }) },
    { clone: () => ({ json: async () => ({ unexpected: true }) }) },
  ]) {
    assert.deepEqual(await submit(async () => ({ data: null, error: { context } }), attempt),
      { kind: "uncertain" }, "unreadable or unknown Edge error remains uncertain");
  }
  assert.deepEqual(await submit(async () => ({ data: { ...receipt, reason: "secret" }, error: null }), attempt),
    { kind: "uncertain" }, "malformed success could follow a commit; preserve UUID");
  const ui = await readFile("src/components/PlatformAdminFeedbackResolutionAction.tsx", "utf8");
  const compiled = ts.transpileModule(ui, {
    fileName: "PlatformAdminFeedbackResolutionAction.tsx",
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, "TSX syntax");
  assert.match(ui, /crypto\.randomUUID\(\)/, "operation ID minted in client");
  assert.match(ui, /send\(attempt\)/, "retry must reuse the saved attempt");
  assert.match(ui, /outcome\.kind === "uncertain"/, "ambiguous response must not reset attempt");
  assert.match(ui, /confirmed && reasonLength >= 10/, "explicit confirmation and reason required");
  assert.match(ui, /role === "operator" \|\| role === "super_admin"/, "reviewers cannot see mutation preflight");
  assert.match(ui, /generation\.current/, "identity change invalidates stale responses");
  assert.doesNotMatch(ui, /supabase\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.storage\./,
    "browser must never mutate private DB directly");
  assert.doesNotMatch(ui, /actor_auth_user_id|service_role|item\.message|submitter_auth_user_id/,
    "browser must not transmit actor or private identity");
  console.log("PASS: V8 feedback resolution action validation, retry, conflict, and UI contract");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
