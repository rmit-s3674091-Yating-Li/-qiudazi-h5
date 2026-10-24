import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "qiudazi-point-actor-retry-"));
try {
  const source = await readFile("src/domain/PointOperationIdentity.ts", "utf8");
  const result = ts.transpileModule(source, {
    fileName: "PointOperationIdentity.ts", reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  assert.equal(result.diagnostics?.length ?? 0, 0);
  const path = join(dir, "PointOperationIdentity.mjs");
  await writeFile(path, result.outputText, "utf8");
  const { bindPointOperationIdentity: bind } = await import(pathToFileURL(path).href);
  const pending = new Map();
  const first = { authUserId: "actor-A", eventId: "event-1", matchId: "match-1", side: "A" };
  assert.equal(bind(pending, "op-1", first), true);
  assert.equal(bind(pending, "op-1", { ...first }), true, "same-actor retry must be allowed");
  for (const change of [
    { authUserId: "actor-B" }, { eventId: "event-2" },
    { matchId: "match-2" }, { side: "B" },
  ]) {
    assert.equal(bind(pending, "op-1", { ...first, ...change }), false,
      "an existing operation cannot change actor or scoring payload");
  }
  assert.deepEqual(pending.get("op-1"), first, "rejected retry cannot rewrite original binding");
  assert.equal(bind(pending, "op-2", { ...first, authUserId: "actor-B" }), true,
    "another account can create its own new operation");
  pending.delete("op-1");
  assert.equal(bind(pending, "op-1", { ...first, authUserId: "actor-B" }), true,
    "a completed operation is no longer a pending client retry");

  const repository = await readFile("src/repositories/supabase.ts", "utf8");
  const bindAt = repository.indexOf("bindPointOperationIdentity(pointOperationIdentities,operationId,identity)");
  const invokeAt = repository.indexOf('functions.invoke("tournament-command"');
  const verifyAt = repository.indexOf("currentSession.session?.user.id!==session.user.id");
  assert.ok(bindAt >= 0 && bindAt < invokeAt && invokeAt < verifyAt,
    "bind before invoking Edge and recheck identity before returning point snapshot");
  assert.match(repository, /headers:\{Authorization:`Bearer \$\{session\.access_token\}`\}/,
    "JWT must be pinned to the original session, not a later account");
  assert.match(repository, /pointOperationIdentities\.delete\(operationId\)/,
    "successful point commands must release their pending binding");
  assert.doesNotMatch(repository, /body:\{[^}]*actor_(?:id|auth_user_id)/,
    "browser must not choose the server actor");
  console.log("PASS V8 point operation identity binding and account-switch retry contract");
} finally {
  await rm(dir, { recursive: true, force: true });
}
