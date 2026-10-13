import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-admin-audit-ui-"));
try {
  const source = await readFile("src/domain/PlatformAdminAuditHistory.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PlatformAdminAuditHistory.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const path = join(tmp, "PlatformAdminAuditHistory.mjs");
  await writeFile(path, compiled.outputText, "utf8");
  const { parseAdminAuditPage: parse } = await import(pathToFileURL(path).href);
  const row = {
    id: "a1111111-1111-4111-8111-111111111111",
    actor_auth_user_id: "a2222222-2222-4222-8222-222222222222",
    action: "EVENT_CANCEL",
    target_kind: "event",
    target_id: "a3333333-3333-4333-8333-333333333333",
    reason: "Confirmed organizer policy violation",
    risk_level: "high",
    created_at: "2026-10-13T00:00:00+00:00",
  };
  const cursor = { created_at: row.created_at, id: row.id };
  assert.deepEqual(parse({ items: [row], next_cursor: cursor }), { items: [row], nextCursor: cursor });
  assert.deepEqual(parse({ items: [], next_cursor: null }), { items: [], nextCursor: null });
  for (const bad of [null, [], {}, { items: [], next_cursor: {} },
    { items: [], next_cursor: { ...cursor, id: "not-uuid" } },
    { items: [row], next_cursor: undefined },
    { items: [{ ...row, actor_auth_user_id: "not-uuid" }], next_cursor: null },
    { items: [{ ...row, risk_level: "root" }], next_cursor: null },
    { items: [{ ...row, reason: null }], next_cursor: null },
    { items: [{ ...row, created_at: "yesterday" }], next_cursor: null },
    { items: Array.from({ length: 51 }, () => row), next_cursor: null },
  ]) assert.equal(parse(bad), null, "malformed audit response must fail closed");

  const ui = await readFile("src/components/PlatformAdminAuditHistory.tsx", "utf8");
  const shell = await readFile("src/pages/PlatformAdminPage.tsx", "utf8");
  assert.match(ui, /functions\.invoke\("platform-admin-audit"/, "audit must use dedicated Edge route");
  assert.match(ui, /parseAdminAuditPage\(data\)/, "Edge responses must be validated");
  assert.match(ui, /generation\.current !== epoch/, "stale requests must not update current account UI");
  assert.match(ui, /page_size: 20/, "audit queries must be bounded");
  assert.match(ui, /setState\("failed"\)/, "failed authorization must hide audit rows");
  assert.match(ui, /overflowWrap: "anywhere"/, "long IDs must not overflow mobile cards");
  assert.match(ui, /disabled=\{busy\}/, "duplicate pagination clicks must be disabled");
  assert.doesNotMatch(ui, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/,
    "audit browser must not query private tables or mutate data");
  assert.match(shell, /status === "allowed"/, "role gating must remain in place");
  assert.match(shell, /<PlatformAdminAuditHistory key=\{userId\}/,
    "audit data must be reset when the authenticated account changes");
  assert.match(shell, /setAccess\(\{ userId, status: "loading", role: null \}\)/,
    "role revalidation must hide old audit content");
  console.log("V8 Platform Admin audit history parser and UI contract passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
