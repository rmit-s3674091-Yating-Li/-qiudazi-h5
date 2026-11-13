import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-admin-feedback-ui-"));
try {
  const source = await readFile("src/domain/PlatformAdminFeedbackDirectory.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PlatformAdminFeedbackDirectory.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, "domain TypeScript syntax");
  const modulePath = join(tmp, "PlatformAdminFeedbackDirectory.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { parseAdminFeedbackPage: parse } = await import(pathToFileURL(modulePath).href);
  const id = "a1111111-1111-4111-8111-111111111111";
  const olderId = "a1111111-1111-4111-8111-111111111110";
  const row = { id, category: "accessibility", status: "open", version: 1,
    created_at: "2026-10-14T00:00:00+00:00" };
  const cursor = { created_at: row.created_at, id };
  assert.deepEqual(parse({ items: [row], next_cursor: cursor }, "open", 1),
    { items: [row], nextCursor: cursor });
  assert.deepEqual(parse({ items: [], next_cursor: null }, null), { items: [], nextCursor: null });
  assert.deepEqual(parse({ items: [{ ...row, status: "resolved", category: "bug" }], next_cursor: null }, null)?.items.length, 1);
  assert.deepEqual(parse({ items: [{ ...row, id: olderId }], next_cursor: null }, "open", 20, cursor)?.items.length, 1);
  const invalid = [null, [], {}, { items: [], next_cursor: cursor },
    { items: [row], next_cursor: undefined },
    { items: [{ ...row, message: "private feedback" }], next_cursor: null },
    { items: [{ ...row, submitter_auth_user_id: id }], next_cursor: null },
    { items: [{ ...row, internal_note: "secret" }], next_cursor: null },
    { items: [{ ...row, category: "privacy" }], next_cursor: null },
    { items: [{ ...row, status: "unknown" }], next_cursor: null },
    { items: [{ ...row, status: "resolved" }], next_cursor: null },
    { items: [{ ...row, version: 0 }], next_cursor: null },
    { items: [{ ...row, created_at: "yesterday" }], next_cursor: null },
    { items: [row, row], next_cursor: null },
    { items: [row], next_cursor: { ...cursor, id: olderId } },
    { items: [row], next_cursor: { ...cursor, debug: "secret" } },
    { items: [row], next_cursor: cursor, debug: "secret" },
  ];
  for (const value of invalid) assert.equal(parse(value, "open"), null, "bad or overshared feedback must fail closed");
  assert.equal(parse({ items: [row], next_cursor: null }, "open", 0), null);
  assert.equal(parse({ items: [row, row], next_cursor: null }, "open", 1), null);
  assert.equal(parse({ items: [row], next_cursor: null }, "invalid"), null);
  assert.equal(parse({ items: [row], next_cursor: cursor }, "open"), null,
    "non-null cursor requires a full page");
  assert.equal(parse({ items: [row], next_cursor: null }, "open", 20, cursor), null,
    "stale replay of prior page must fail closed");
  assert.equal(parse({ items: [row, { ...row, id: olderId, created_at: "2026-10-15T00:00:00+00:00" }], next_cursor: null }, null), null,
    "descending chronology required");

  const ui = await readFile("src/components/PlatformAdminFeedbackDirectory.tsx", "utf8");
  assert.match(ui, /functions\.invoke\("platform-admin-feedback"/, "trusted JWT-authenticated Edge endpoint");
  assert.match(ui, /parseAdminFeedbackPage\(data, selected === "all" \? null : selected, 20, before\)/,
    "status and cursor scoped parser");
  assert.match(ui, /loadedScope !== scope/, "hide previous account or filter rows");
  assert.match(ui, /generation\.current !== epoch/, "ignore stale requests");
  assert.match(ui, /\[userId, filter\]/, "reset on account/filter changes");
  assert.match(ui, /setItems\(\[\]\)/, "clear rows after permission loss or failure");
  assert.match(ui, /page_size: 20/, "bounded pagination");
  assert.match(ui, /disabled=\{busy\}/, "avoid repeated pagination clicks");
  assert.doesNotMatch(ui, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.storage\./,
    "no browser DB/Storage access or mutations");
  assert.doesNotMatch(ui, /item\.message|item\.submitter_auth_user_id|item\.internal_note/,
    "no feedback narratives or identities displayed");
  const checked = ts.transpileModule(ui, {
    fileName: "PlatformAdminFeedbackDirectory.tsx",
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(checked.diagnostics?.length ?? 0, 0, "UI TSX syntax");
  console.log("PASS: V8 Platform Admin feedback metadata parser and read-only UI contract");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
