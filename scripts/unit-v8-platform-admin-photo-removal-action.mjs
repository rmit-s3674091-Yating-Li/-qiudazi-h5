import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const domain = readFileSync("src/domain/PlatformAdminPhotoRemoval.ts", "utf8");
const compiled = ts.transpileModule(domain, {
  fileName: "PlatformAdminPhotoRemoval.ts",
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const logic = await import(`data:text/javascript,${encodeURIComponent(compiled.outputText)}`);
const eventId = "b1111111-1111-4111-8111-111111111111";
const photoId = "c1111111-1111-4111-8111-111111111111";
const response = { photo_id: photoId, event_id: eventId, cleanup_pending: true, replayed: false };
assert.deepEqual(logic.parsePhotoRemovalResult(response, eventId, photoId), {
  photoId, eventId, cleanupPending: true, replayed: false,
});
assert.equal(logic.parsePhotoRemovalResult({ ...response, replayed: true, cleanup_pending: false }, eventId, photoId)?.replayed, true);
for (const bad of [null, {}, { ...response, photo_id: eventId }, { ...response, event_id: photoId },
  { ...response, cleanup_pending: "true" }, { ...response, replayed: "false" },
  { ...response, storage_path: "private" }, { ...response, original_url: "private" }]) {
  assert.equal(logic.parsePhotoRemovalResult(bad, eventId, photoId), null);
}
assert.equal(logic.parsePhotoRemovalResult(response, "invalid", photoId), null);
for (const value of ["short", " ".repeat(20), "x".repeat(1001)]) assert.equal(logic.validPhotoRemovalReason(value), false);
for (const value of ["A valid reason", "  A valid reason  ", "违规定向披露用户照片"])
  assert.equal(logic.validPhotoRemovalReason(value), true);
let created = 0;
const makeId = () => `request-${++created}`;
const first = logic.photoRemovalOperation(null, "user:event:photo:1:reason", makeId);
assert.equal(logic.photoRemovalOperation(first, "user:event:photo:1:reason", makeId).id, first.id);
assert.equal(created, 1, "network retry must reuse the exact operation ID");
assert.notEqual(logic.photoRemovalOperation(first, "user:event:photo:2:reason", makeId).id, first.id);

const component = readFileSync("src/components/PlatformAdminPhotoRemovalAction.tsx", "utf8");
const directory = readFileSync("src/components/PlatformAdminPhotoDirectory.tsx", "utf8");
for (const [name, source] of [["action", component], ["directory", directory]]) {
  const compiledTsx = ts.transpileModule(source, {
    fileName: `${name}.tsx`,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true,
  });
  assert.equal(compiledTsx.diagnostics?.length ?? 0, 0, `${name} TSX syntax`);
}
assert.match(directory, /role === "super_admin"/);
assert.match(directory, /rpc<string \| null>\("platform_admin_my_role"\)/);
assert.match(directory, /\{superAdmin && <PlatformAdminPhotoRemovalAction/);
assert.match(directory, /onRemoved=\{\(\) => void loadPage\(null, true, \+\+generation\.current\)\}/);
assert.match(component, /functions\.invoke\("platform-admin-photo-remove"/);
assert.match(component, /photoRemovalOperation\(operation\.current, payloadKey/);
assert.match(component, /request_id: requestId, reason: trimmed, confirmed: true/);
assert.match(component, /parsePhotoRemovalResult\(data, eventId, photoId\)/);
assert.match(component, /!confirmed \|\| !validPhotoRemovalReason\(reason\)/);
assert.match(component, /generation\.current !== epoch/);
assert.doesNotMatch(component + directory, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.storage\./);
assert.doesNotMatch(component, /actor_auth_user_id|p_actor_auth_user_id|storage_path|original_url/);
console.log("V8 photo removal UI / retry / response contract passed");
