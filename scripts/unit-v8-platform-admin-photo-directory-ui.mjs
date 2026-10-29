import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-admin-photo-ui-"));
try {
  const source = await readFile("src/domain/PlatformAdminPhotoDirectory.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PlatformAdminPhotoDirectory.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const modulePath = join(tmp, "PlatformAdminPhotoDirectory.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { parseAdminPhotoPage: parse } = await import(pathToFileURL(modulePath).href);
  const event = "b1111111-1111-4111-8111-111111111111";
  const other = "c1111111-1111-4111-8111-111111111111";
  const row = { id: "d1111111-1111-4111-8111-111111111111", event_id: event,
    version: 1, uploaded_at: "2026-10-13T09:00:00+00:00" };
  const cursor = { uploaded_at: row.uploaded_at, id: row.id };
  assert.deepEqual(parse({ items: [row], next_cursor: cursor }, event, 1),
    { items: [row], nextCursor: cursor });
  assert.deepEqual(parse({ items: [], next_cursor: null }, event), { items: [], nextCursor: null });
  for (const bad of [null, [], {}, { items: [], next_cursor: cursor },
    { items: [row], next_cursor: undefined },
    { items: [{ ...row, event_id: other }], next_cursor: null },
    { items: [{ ...row, original_url: "secret" }], next_cursor: null },
    { items: [{ ...row, signed_url: "secret" }], next_cursor: null },
    { items: [{ ...row, uploader_id: other }], next_cursor: null },
    { items: [{ ...row, version: 0 }], next_cursor: null },
    { items: [{ ...row, uploaded_at: "yesterday" }], next_cursor: null },
    { items: [row, row], next_cursor: null },
    { items: [row], next_cursor: { ...cursor, id: other } },
    { items: [row], next_cursor: { ...cursor, extra: "secret" } },
    { items: [row], next_cursor: cursor, private_data: "secret" },
  ]) assert.equal(parse(bad, event), null, "bad/overshared photo page must fail closed");
  assert.equal(parse({ items: [row], next_cursor: null }, "bad-event"), null);
  assert.equal(parse({ items: [row], next_cursor: null }, event, 0), null);
  assert.equal(parse({ items: [row, row], next_cursor: null }, event, 1), null);

  const ui = await readFile("src/components/PlatformAdminPhotoDirectory.tsx", "utf8");
  assert.match(ui, /functions\.invoke\("platform-admin-photos"/, "JWT Edge endpoint");
  assert.match(ui, /event_id: eventId, page_size: 20/, "event scope and bounded page");
  assert.match(ui, /parseAdminPhotoPage\(data, eventId, 20\)/, "event-scoped strict response parser");
  assert.match(ui, /generation\.current !== epoch/, "ignore stale requests");
  assert.match(ui, /loadedScope !== scope/, "do not render prior event/account data");
  assert.match(ui, /\[userId, eventId\]/, "reset on account and event changes");
  assert.match(ui, /setItems\(\[\]\)/, "clear data on revoked access or errors");
  assert.match(ui, /disabled=\{busy\}/, "prevent duplicate pagination");
  assert.match(ui, /overflowWrap: "anywhere"/, "long identifiers fit mobile");
  assert.doesNotMatch(ui, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/,
    "no direct DB access or browser mutation");
  assert.doesNotMatch(ui, /signed_url|original_url|storage_path/, "no private image URL leaks");
  const transpiled = ts.transpileModule(ui, { fileName: "PlatformAdminPhotoDirectory.tsx",
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0, "TSX syntax");
  const review = await readFile("src/components/PlatformAdminPhotoReview.tsx", "utf8");
  const shell = await readFile("src/pages/PlatformAdminPage.tsx", "utf8");
  for (const [name, component] of [["review", review], ["shell", shell]]) {
    const checked = ts.transpileModule(component, {
      fileName: `${name}.tsx`,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      reportDiagnostics: true,
    });
    assert.equal(checked.diagnostics?.length ?? 0, 0, `${name} TSX syntax`);
  }
  assert.match(shell, /status === "allowed"/, "admin shell remains fail-closed");
  assert.match(shell, /<PlatformAdminPhotoReview key=\{userId\}/, "review resets on account change");
  assert.match(review, /validAdminPhotoId\(candidate\)/, "reject invalid event identifiers before request");
  assert.match(review, /setEventId\(null\)/, "changing event clears previous photo scope");
  assert.match(review, /<PlatformAdminPhotoDirectory key=\{`\$\{userId\}:\$\{eventId\}`\}/,
    "event and user scoped photo directory remount");
  assert.match(ui, /<PlatformAdminPhotoPreview key=\{item.id\}/, "only a listed photo may be previewed");
  assert.match(ui, /selectedPhotoId === item.id/, "only selected current event photo is rendered");
  assert.match(ui, /setSelectedPhotoId\(null\)/, "clear selection on refresh, failure or scope change");
  assert.doesNotMatch(review + shell, /\.storage\.|\.insert\(|\.update\(|\.delete\(|\.upsert\(/,
    "integration must not access storage or mutate data from browser");
  console.log("V8 Platform Admin photo directory and watermarked review integration contract passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
