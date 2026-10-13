import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-admin-event-ui-"));
try {
  const source = await readFile("src/domain/PlatformAdminEventDirectory.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PlatformAdminEventDirectory.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const modulePath = join(tmp, "PlatformAdminEventDirectory.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { parseAdminEventPage: parse } = await import(pathToFileURL(modulePath).href);
  const row = {
    id: "b1111111-1111-4111-8111-111111111111", name: "Test event",
    owner_user_id: "c1111111-1111-4111-8111-111111111111", status: "signup",
    version: 2, visibility: "private", event_mode: "standard", match_type: "singles",
    format: "round_robin", city: "Beijing", event_date: "2026-10-20",
    created_at: "2026-10-12T01:00:00+00:00",
  };
  const cursor = { created_at: row.created_at, id: row.id };
  assert.deepEqual(parse({ items: [row], next_cursor: cursor }), { items: [row], nextCursor: cursor });
  assert.deepEqual(parse({ items: [], next_cursor: null }), { items: [], nextCursor: null });
  assert.deepEqual(parse({ items: [{ ...row, city: null, event_date: null }], next_cursor: null })?.items[0].city, null);
  for (const bad of [null, [], {}, { items: [], next_cursor: {} },
    { items: [], next_cursor: cursor }, { items: [row], next_cursor: undefined },
    { items: [row], next_cursor: null, secret: "private" },
    { items: [{ ...row, private_email: "secret@example.invalid" }], next_cursor: null },
    { items: [{ ...row, status: "deleted" }], next_cursor: null },
    { items: [{ ...row, owner_user_id: "invalid" }], next_cursor: null },
    { items: [{ ...row, event_date: "2026-02-30" }], next_cursor: null },
    { items: [{ ...row, created_at: "yesterday" }], next_cursor: null },
    { items: [{ ...row, version: 1.5 }], next_cursor: null },
    { items: [row, row], next_cursor: null },
    { items: [row], next_cursor: { ...cursor, id: row.owner_user_id } },
    { items: Array.from({ length: 21 }, (_, i) => ({ ...row, id: `b${String(i).padStart(7,"0")}-1111-4111-8111-111111111111` })), next_cursor: null },
  ]) assert.equal(parse(bad), null, "malformed or overshared event response must fail closed");

  const ui = await readFile("src/components/PlatformAdminEventDirectory.tsx", "utf8");
  const shell = await readFile("src/pages/PlatformAdminPage.tsx", "utf8");
  assert.match(ui, /functions\.invoke\("platform-admin-events"/, "dedicated JWT Edge route");
  assert.match(ui, /parseAdminEventPage\(data\)/, "strict Edge response parser");
  assert.match(ui, /generation\.current !== epoch/, "stale response suppression");
  assert.match(ui, /\[userId, filter\]/, "account and filter reset");
  assert.match(ui, /setItems\(\[\]\)/, "authorization failure clears rows");
  assert.match(ui, /page_size: 20/, "bounded pagination");
  assert.match(ui, /disabled=\{busy\}/, "prevent duplicate pagination");
  assert.doesNotMatch(ui, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/, "no browser DB mutation");
  assert.match(shell, /<PlatformAdminEventDirectory key=\{userId\}/, "admin shell mounts event directory");
  assert.match(shell, /setAccess\(\{ userId, status: "loading", role: null \}\)/, "parent revalidates admin role");
  console.log("V8 Platform Admin event directory parser and UI contract passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
