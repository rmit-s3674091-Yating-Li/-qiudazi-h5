import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const page = await readFile("src/pages/PlatformAdminPage.tsx", "utf8");
assert.match(page, /import \{ PlatformAdminReportDirectory \} from "\.\.\/components\/PlatformAdminReportDirectory";/);
assert.match(page, /import \{ PlatformAdminFeedbackDirectory \} from "\.\.\/components\/PlatformAdminFeedbackDirectory";/);
assert.match(page, /\{status === "allowed" && <>[\s\S]*zh === "举报与反馈" \? <div>/,
  "report and feedback directories must only mount in an allowed admin session");
assert.match(page, /<PlatformAdminReportDirectory key=\{`\$\{userId\}-reports`\} userId=\{userId!\} en=\{en\} \/>/);
assert.match(page, /<PlatformAdminFeedbackDirectory key=\{`\$\{userId\}-feedback`\} userId=\{userId!\} en=\{en\} \/>/);
assert.match(page, /access\.userId !== userId \? "loading" : access\.status/,
  "previous account role must never authorize the new account");
assert.match(page, /setAccess\(\{ userId, status: "loading", role: null \}\)/,
  "focus and visibility rechecks must fail closed");
assert.match(page, /<h3>\{en \? "Reports" : "举报记录"\}<\/h3>/);
assert.match(page, /<h3>\{en \? "Feedback" : "用户反馈"\}<\/h3>/);
assert.doesNotMatch(page, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/,
  "admin page must not mutate tables directly");
const compiled = ts.transpileModule(page, {
  fileName: "PlatformAdminPage.tsx",
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "page TSX syntax");
console.log("PASS: V8 admin report and feedback shell integration contract");
