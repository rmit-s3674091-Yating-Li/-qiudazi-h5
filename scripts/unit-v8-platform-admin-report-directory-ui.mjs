import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-admin-report-ui-"));
try {
  const source = await readFile("src/domain/PlatformAdminReportDirectory.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PlatformAdminReportDirectory.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, "domain TypeScript syntax");
  const modulePath = join(tmp, "PlatformAdminReportDirectory.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { parseAdminReportPage: parse } = await import(pathToFileURL(modulePath).href);
  const id = "a1111111-1111-4111-8111-111111111111";
  const targetId = "b1111111-1111-4111-8111-111111111111";
  const row = { id, target_kind: "event", target_id: targetId, category: "privacy",
    status: "open", version: 1, created_at: "2026-10-14T00:00:00+00:00" };
  const cursor = { created_at: row.created_at, id };
  assert.deepEqual(parse({ items: [row], next_cursor: cursor }, "open", 1),
    { items: [row], nextCursor: cursor });
  assert.deepEqual(parse({ items: [], next_cursor: null }, null), { items: [], nextCursor: null });
  assert.deepEqual(parse({ items: [{ ...row, status: "resolved", target_kind: "photo", category: "safety" }], next_cursor: null }, null)?.items.length, 1);
  for (const bad of [null, [], {}, { items: [], next_cursor: cursor },
    { items: [row], next_cursor: undefined },
    { items: [{ ...row, reporter_auth_user_id: targetId }], next_cursor: null },
    { items: [{ ...row, summary: "private narrative" }], next_cursor: null },
    { items: [{ ...row, internal_note: "private" }], next_cursor: null },
    { items: [{ ...row, target_kind: "organization" }], next_cursor: null },
    { items: [{ ...row, category: "invalid" }], next_cursor: null },
    { items: [{ ...row, status: "resolved" }], next_cursor: null },
    { items: [{ ...row, target_id: "invalid" }], next_cursor: null },
    { items: [{ ...row, version: 0 }], next_cursor: null },
    { items: [{ ...row, created_at: "yesterday" }], next_cursor: null },
    { items: [row, row], next_cursor: null },
    { items: [row], next_cursor: { ...cursor, id: targetId } },
    { items: [row], next_cursor: { ...cursor, secret: "private" } },
    { items: [row], next_cursor: cursor, extra: "private" },
  ]) assert.equal(parse(bad, "open"), null, "bad or overshared report response must fail closed");
  assert.equal(parse({ items: [row], next_cursor: null }, "open", 0), null);
  assert.equal(parse({ items: [row, row], next_cursor: null }, "open", 1), null);
  assert.equal(parse({ items: [row], next_cursor: null }, "invalid"), null);
  assert.equal(parse({ items: [row], next_cursor: cursor }, "open"), null,
    "non-null cursor requires full page");

  const ui = await readFile("src/components/PlatformAdminReportDirectory.tsx", "utf8");
  assert.match(ui, /functions\.invoke\("platform-admin-reports"/, "JWT-authenticated Edge endpoint");
  assert.match(ui, /parseAdminReportPage\(data, selected === "all" \? null : selected, 20\)/,
    "strict status-scoped response parser");
  assert.match(ui, /generation\.current !== epoch/, "ignore stale requests");
  assert.match(ui, /loadedScope !== scope/, "do not show previous user or filter records");
  assert.match(ui, /\[userId, filter\]/, "reset on account or filter changes");
  assert.match(ui, /setItems\(\[\]\)/, "clear data on errors and permission revocation");
  assert.match(ui, /page_size: 20/, "bounded pagination");
  assert.match(ui, /disabled=\{busy\}/, "prevent repeated pagination clicks");
  assert.doesNotMatch(ui, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.storage\./,
    "no direct DB or Storage access");
  assert.doesNotMatch(ui, /item\.summary|item\.reporter_auth_user_id|item\.internal_note/,
    "do not render sensitive report fields");
  const transpiled = ts.transpileModule(ui, {
    fileName: "PlatformAdminReportDirectory.tsx",
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0, "UI TSX syntax");
  console.log("PASS: V8 Platform Admin report metadata parser and UI contract");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
