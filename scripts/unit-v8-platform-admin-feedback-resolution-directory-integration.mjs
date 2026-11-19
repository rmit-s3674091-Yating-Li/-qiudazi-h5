import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const path = "src/components/PlatformAdminFeedbackDirectory.tsx";
const source = await readFile(path, "utf8");
const checked = ts.transpileModule(source, {
  fileName: path,
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(checked.diagnostics?.length ?? 0, 0, "feedback directory TSX syntax");
assert.match(source, /PlatformAdminFeedbackResolutionAction/, "mount audited action module");
assert.match(source, /rpc<string \| null>\("platform_admin_my_role"\)/, "role from current caller");
assert.match(source, /setRoleAccess\(\{ userId, role: null \}\)/, "fail closed during role refresh");
assert.match(source, /roleEpoch\.current !== epoch/, "discard stale role responses");
assert.match(source, /window\.addEventListener\("focus", onFocus\)/, "focus reauthorization");
assert.match(source, /document\.addEventListener\("visibilitychange", onFocus\)/, "visibility reauthorization");
assert.match(source, /const canResolve = actionRole === "operator" \|\| actionRole === "super_admin"/, "reviewer cannot mutate");
assert.match(source, /item\.status === "open" \|\| item\.status === "in_review"/, "terminal records cannot be actioned");
assert.match(source, /onRefresh=\{refreshAfterAction\}/, "server-authoritative refresh after mutation");
assert.match(source, /const epoch = \+\+generation\.current;/, "refresh invalidates stale pagination");
assert.match(source, /setSelectedId\(null\)/, "action form cleared on refresh and scope changes");
assert.match(source, /loadedScope !== scope/, "identity/filter fail-closed render");
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.storage\./,
  "browser cannot mutate private database directly");
assert.doesNotMatch(source, /item\.message|item\.submitter_auth_user_id|item\.internal_note|actor_auth_user_id|service_role/,
  "no private identity, message or actor override");
console.log("PASS: V8 feedback directory audited action integration contract");
