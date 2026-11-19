import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const directory = await readFile("src/components/PlatformAdminEventDirectory.tsx", "utf8");
const compiled = ts.transpileModule(directory, {
  fileName: "PlatformAdminEventDirectory.tsx",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "event directory must transpile");
assert.match(directory, /PlatformAdminEventCancelAction/);
assert.match(directory, /rpc<string \| null>\("platform_admin_my_role"\)/);
assert.match(directory, /role === "super_admin" \? role : null/);
assert.match(directory, /roleAccess\.userId === userId && roleAccess\.role === "super_admin"/);
assert.match(directory, /item\.status === "signup" \|\| item\.status === "locked"/);
assert.match(directory, /onCancelled=\{refreshAfterCancel\}/);
assert.match(directory, /setLoadedScope\(scope\)/);
assert.match(directory, /if \(loadedScope !== scope\) return/);
assert.match(directory, /window\.addEventListener\("focus", onFocus\)/);
assert.match(directory, /document\.addEventListener\("visibilitychange", onFocus\)/);
assert.match(directory, /roleEpoch\.current !== epoch/);
assert.doesNotMatch(directory, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|actor_auth_user_id|service_role/);
console.log("PASS: V8 admin event cancellation directory integration and security contract");
