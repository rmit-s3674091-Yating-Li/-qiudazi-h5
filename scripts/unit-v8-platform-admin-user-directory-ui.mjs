import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-admin-user-ui-"));
try {
  const source = await readFile("src/domain/PlatformAdminUserDirectory.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PlatformAdminUserDirectory.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const path = join(tmp, "PlatformAdminUserDirectory.mjs");
  await writeFile(path, compiled.outputText, "utf8");
  const { parseAdminUserPage: parse } = await import(pathToFileURL(path).href);
  const row = { id: "b6666666-6666-4666-8666-666666666661", nickname: "Player A", profile_status: "completed", created_at: "2026-10-13T01:00:00+00:00" };
  const cursor = { created_at: row.created_at, id: row.id };
  assert.deepEqual(parse({ items: [row], next_cursor: cursor }), { items: [row], nextCursor: cursor });
  assert.deepEqual(parse({ items: [], next_cursor: null }), { items: [], nextCursor: null });
  assert.deepEqual(parse({ items: [{ ...row, nickname: null }], next_cursor: null })?.items[0].nickname, null);
  for (const bad of [null, [], {}, { items: [], next_cursor: {} },
    { items: [], next_cursor: cursor },
    { items: [row], next_cursor: undefined },
    { items: [row], next_cursor: { ...cursor, id: "not-a-uuid" } },
    { items: [row], next_cursor: { ...cursor, id: "b6666666-6666-4666-8666-666666666662" } },
    { items: [row], next_cursor: { ...cursor, created_at: "2026-10-12T01:00:00+00:00" } },
    { items: [{ ...row, email: "private@example.invalid" }], next_cursor: null },
    { items: [{ ...row, auth_user_id: row.id }], next_cursor: null },
    { items: [{ ...row, id: "not-a-uuid" }], next_cursor: null },
    { items: [{ ...row, profile_status: null }], next_cursor: null },
    { items: [{ ...row, created_at: "yesterday" }], next_cursor: null },
    { items: [row, row], next_cursor: null },
    { items: Array.from({ length: 21 }, (_, i) => ({ ...row, id: `b6666666-6666-4666-8666-${String(i).padStart(12, "0")}` })), next_cursor: null },
  ]) assert.equal(parse(bad), null, "malformed or sensitive user response must fail closed");

  const ui = await readFile("src/components/PlatformAdminUserDirectory.tsx", "utf8");
  const shell = await readFile("src/pages/PlatformAdminPage.tsx", "utf8");
  for (const [name, text] of [["PlatformAdminUserDirectory.tsx", ui], ["PlatformAdminPage.tsx", shell]]) {
    const result = ts.transpileModule(text, {
      fileName: name,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      reportDiagnostics: true,
    });
    assert.equal(result.diagnostics?.length ?? 0, 0, `${name} must transpile`);
  }
  assert.match(ui, /functions\.invoke\("platform-admin-users"/, "browser must use trusted Edge route");
  assert.match(ui, /parseAdminUserPage\(data\)/, "responses must be validated");
  assert.match(ui, /page_size: 20/, "requests must be bounded");
  assert.match(ui, /generation\.current !== epoch/, "stale requests must not update a new account");
  assert.match(ui, /setState\("failed"\)/, "failed auth must hide user rows");
  assert.match(ui, /overflowWrap: "anywhere"/, "long IDs must not overflow mobile cards");
  assert.match(ui, /disabled=\{busy\}/, "prevent duplicate pagination requests");
  assert.doesNotMatch(ui, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/, "browser must not directly access private tables or mutate users");
  assert.match(shell, /access\.role === "super_admin" \? <PlatformAdminUserDirectory/, "only super admins can see directory UI");
  assert.match(shell, /<PlatformAdminUserDirectory key=\{userId\}/, "account changes must remount directory");
  assert.match(shell, /setAccess\(\{ userId, status: "loading", role: null \}\)/, "role revalidation must unmount old directory");
  console.log("V8 Platform Admin user directory UI and parser contract passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
