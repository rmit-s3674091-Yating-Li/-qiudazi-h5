import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const page = await readFile("src/pages/PlatformAdminPage.tsx", "utf8");
assert.match(page, /import \{ PlatformAdminReportDirectory \} from "\.\.\/components\/PlatformAdminReportDirectory";/);
assert.match(page, /import \{ PlatformAdminFeedbackDirectory \} from "\.\.\/components\/PlatformAdminFeedbackDirectory";/);
assert.doesNotMatch(page, /This page is read-only until audited management actions are available|审计化管理操作上线前，此页面仅供查看模块范围/,
  "admin shell must not misrepresent already available audited management actions as read-only");
assert.match(page, /Only authorized management actions are enabled/);
assert.match(page, /仅开放当前权限允许的管理操作/);
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
// Report directory must reject stale/overlapping pages just like the feedback directory.
const reportDomain = await readFile("src/domain/PlatformAdminReportDirectory.ts", "utf8");
const reportCompiled = ts.transpileModule(reportDomain, {
  fileName: "PlatformAdminReportDirectory.ts",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(reportCompiled.diagnostics?.length ?? 0, 0, "report parser TypeScript syntax");
const { parseAdminReportPage: parseReport } = await import(
  `data:text/javascript;base64,${Buffer.from(reportCompiled.outputText).toString("base64")}`
);
const id = "a1111111-1111-4111-8111-111111111111";
const olderId = "a1111111-1111-4111-8111-111111111110";
const row = { id, target_kind: "event", target_id: id, category: "safety",
  status: "open", version: 1, created_at: "2026-10-14T00:00:00+00:00" };
const cursor = { created_at: row.created_at, id };
const older = { ...row, id: olderId };
assert.equal(parseReport({ items: [row], next_cursor: null }, "open")?.items.length, 1);
assert.equal(parseReport({ items: [older], next_cursor: null }, "open", 20, cursor)?.items.length, 1);
assert.equal(parseReport({ items: [row], next_cursor: null }, "open", 20, cursor), null,
  "replayed cursor boundary must fail closed");
assert.equal(parseReport({ items: [row, older], next_cursor: null }, "open")?.items.length, 2);
assert.equal(parseReport({ items: [older, row], next_cursor: null }, "open"), null,
  "out-of-order report rows must fail closed");
assert.equal(parseReport({ items: [row], next_cursor: cursor }, "open", 1)?.nextCursor?.id, id);
assert.equal(parseReport({ items: [row], next_cursor: null }, "open", 20,
  { created_at: "invalid", id }), null, "invalid before cursor must fail closed");
const reportUI = await readFile("src/components/PlatformAdminReportDirectory.tsx", "utf8");
assert.match(reportUI, /parseAdminReportPage\(data,selected==="all"\?null:selected,20,before\)/,
  "report page parser must receive the requested cursor");
console.log("PASS: V8 admin report and feedback shell and report cursor boundary contract");
