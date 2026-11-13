import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-venue-admin-ui-"));
try {
  const source = await readFile("src/domain/PlatformAdminVenueCandidates.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PlatformAdminVenueCandidates.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const modulePath = join(tmp, "PlatformAdminVenueCandidates.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { parseAdminVenueCandidatePage: parse } = await import(pathToFileURL(modulePath).href);
  const row = {
    event_id: "b1111111-1111-4111-8111-111111111111",
    venue_name: "奥森网球中心", city: "北京市", event_version: 2,
    created_at: "2026-10-14T09:00:00+00:00", verification_status: "not_verified",
  };
  const cursor = { created_at: row.created_at, event_id: row.event_id };
  assert.deepEqual(parse({ items: [row], next_cursor: null }), { items: [row], nextCursor: null });
  assert.deepEqual(parse({ items: [], next_cursor: null }), { items: [], nextCursor: null });
  assert.equal(parse({ items: [row], next_cursor: null }, cursor), null,
    "the last item of the previous page cannot repeat");
  const olderRow = { ...row, event_id: "a1111111-1111-4111-8111-111111111111",
    created_at: "2026-10-14T08:00:00+00:00" };
  assert.equal(parse({ items: [olderRow], next_cursor: null }, cursor)?.items[0]?.event_id,
    olderRow.event_id, "a strictly older page remains valid");
  const rows = Array.from({ length: 20 }, (_, i) => ({
    ...row, event_id: `${(i+1).toString(16).padStart(8,"0")}-1111-4111-8111-111111111111`,
    created_at: `2026-10-14T${String(20-i).padStart(2,"0")}:00:00Z`,
  }));
  const next = { created_at: rows[19].created_at, event_id: rows[19].event_id };
  assert.equal(parse({ items: rows, next_cursor: next })?.nextCursor?.event_id, next.event_id);
  const bad = [
    null, [], {}, { items: [], next_cursor: {} },
    { items: [row], next_cursor: cursor },
    { items: [row], next_cursor: null, secret: "private" },
    { items: [{ ...row, owner_user_id: "secret" }], next_cursor: null },
    { items: [{ ...row, verification_status: "verified" }], next_cursor: null },
    { items: [{ ...row, city: 7 }], next_cursor: null },
    { items: [{ ...row, venue_name: " " }], next_cursor: null },
    { items: [{ ...row, created_at: "yesterday" }], next_cursor: null },
    { items: [{ ...row, event_version: 1.5 }], next_cursor: null },
    { items: [row, row], next_cursor: null },
    { items: [row, { ...row, event_id: "a1111111-1111-4111-8111-111111111111", created_at: "2026-10-15T09:00:00Z" }], next_cursor: null },
    { items: rows, next_cursor: { ...next, event_id: row.event_id } },
    { items: [...rows, row], next_cursor: null },
  ];
  for (const value of bad) assert.equal(parse(value), null, "invalid/overshared page must fail closed");

  const ui = await readFile("src/components/PlatformAdminVenueCandidateDirectory.tsx", "utf8");
  const jsx = ts.transpileModule(ui, {
    fileName: "PlatformAdminVenueCandidateDirectory.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal(jsx.diagnostics?.length ?? 0, 0);
  assert.match(ui, /functions\.invoke\("platform-admin-venue-candidates"/, "dedicated JWT Edge route");
  assert.match(ui, /parseAdminVenueCandidatePage\(data, before\)/, "strict cursor-bound response contract");
  assert.match(ui, /VENUE_CANDIDATE_PAGE_OVERLAP/, "cross-page duplicates fail closed");
  assert.match(ui, /old\.event_id\.toLowerCase\(\) === row\.event_id\.toLowerCase\(\)/,
    "overlap comparison must be UUID case-insensitive");
  assert.match(ui, /generation\.current !== epoch/, "ignore old responses");
  assert.match(ui, /\[userId\]/, "account change invalidates state");
  assert.match(ui, /setItems\(\[\]\)/, "authorization failure clears rows");
  assert.match(ui, /page_size: 20/, "bounded pagination");
  assert.match(ui, /disabled=\{busy\}/, "disable duplicate requests");
  assert.match(ui, /Not verified/, "candidate status must be visible");
  assert.doesNotMatch(ui, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/, "no browser DB mutation");
  const shell = await readFile("src/pages/PlatformAdminPage.tsx", "utf8");
  assert.match(shell, /<PlatformAdminVenueCandidateDirectory key=\{userId\}/, "mount in allowed admin shell");
  assert.match(shell, /setAccess\(\{ userId, status: "loading", role: null \}\)/, "revalidate on focus");
  console.log("V8 Platform Admin venue candidate parser + readonly UI contract passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
