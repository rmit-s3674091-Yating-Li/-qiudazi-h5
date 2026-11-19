import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temp = await mkdtemp(join(tmpdir(), "qiudazi-v8-admin-user-pagination-"));
try {
  const domain = await readFile("src/domain/PlatformAdminUserDirectory.ts", "utf8");
  const compiled = ts.transpileModule(domain, {
    fileName: "PlatformAdminUserDirectory.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const modulePath = join(temp, "PlatformAdminUserDirectory.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { parseAdminUserPage: parse, adminUserPageFollowsCursor: follows } =
    await import(pathToFileURL(modulePath).href);

  const row = (suffix, created_at) => ({
    id: `b6666666-6666-4666-8666-${String(suffix).padStart(12, "0")}`,
    nickname: null, profile_status: "completed", created_at,
  });
  const later = row(3, "2026-10-15T08:00:00.123457+00:00");
  const middle = row(2, "2026-10-15T08:00:00.123456+00:00");
  const earlier = row(1, "2026-10-15T08:00:00.123455+00:00");
  const page = (items, next_cursor = null) => parse({ items, next_cursor });

  assert.ok(page([later, middle, earlier]), "strict descending microsecond order");
  assert.equal(page([earlier, later]), null, "ascending timestamps fail closed");
  assert.equal(page([middle, later]), null, "same-millisecond order is not enough");
  assert.equal(page([middle, middle]), null, "duplicate IDs fail closed");
  assert.equal(page([middle, { ...middle, id: middle.id.toUpperCase() }]), null,
    "case variants of one UUID are duplicates");

  const tiedHigher = row(9, middle.created_at);
  const tiedLower = row(8, middle.created_at);
  assert.ok(page([tiedHigher, tiedLower]), "UUID descending tie-break");
  assert.equal(page([tiedLower, tiedHigher]), null, "reversed UUID tie-break rejected");
  assert.ok(page([later, middle], { created_at: middle.created_at, id: middle.id }));
  assert.ok(page([], null), "valid terminal empty page");
  assert.equal(page([], { created_at: middle.created_at, id: middle.id }), null);

  const cursor = { created_at: middle.created_at, id: middle.id };
  assert.equal(follows(page([earlier]), cursor), true, "strictly older page accepted");
  assert.equal(follows(page([middle]), cursor), false, "repeated cursor row rejected");
  assert.equal(follows(page([later]), cursor), false, "newer row rejected");
  assert.equal(follows(page([tiedHigher]), cursor), false, "higher UUID at same time rejected");
  assert.equal(follows(page([row(1, middle.created_at)]), cursor), true, "lower UUID at same time accepted");
  assert.equal(follows(page([]), cursor), true, "empty terminal page accepted");
  assert.equal(follows(page([later]), null), true, "first page has no prior boundary");

  const ui = await readFile("src/components/PlatformAdminUserDirectory.tsx", "utf8");
  const jsx = ts.transpileModule(ui, {
    fileName: "PlatformAdminUserDirectory.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal(jsx.diagnostics?.length ?? 0, 0);
  assert.match(ui, /adminUserPageFollowsCursor\(page, before\)/,
    "UI must reject an invalid cross-page cursor before appending rows");
  assert.match(ui, /setItems\(\[\]\)/, "authorization failure clears cached rows");
  assert.match(ui, /generation\.current !== epoch/, "stale response isolation retained");
  console.log("PASS: V8 Platform Admin user pagination order and cursor boundary");
} finally {
  await rm(temp, { recursive: true, force: true });
}
