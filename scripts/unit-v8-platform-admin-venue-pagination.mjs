import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temp = await mkdtemp(join(tmpdir(), "v8-admin-venue-pagination-"));
try {
  const source = await readFile("src/domain/PlatformAdminVenueCandidates.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PlatformAdminVenueCandidates.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const modulePath = join(temp, "venue.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { parseAdminVenueCandidatePage: parse } = await import(pathToFileURL(modulePath).href);

  const id = (n) => `${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
  const row = (n, time) => ({
    event_id: id(n), venue_name: `Venue ${n}`, city: "北京",
    event_version: 1, created_at: time, verification_status: "not_verified",
  });
  const page = (items, next_cursor = null) => ({ items, next_cursor });
  const before = { created_at: "2026-10-15T10:00:00Z", event_id: id(2) };
  assert.equal(parse(page([row(1, "2026-10-15T09:59:00Z")]), before)?.items.length, 1);
  assert.equal(parse(page([row(1, before.created_at)]), before)?.items.length, 1);
  assert.equal(parse(page([row(2, before.created_at)]), before), null, "replayed cursor row must be rejected");
  assert.equal(parse(page([row(3, before.created_at)]), before), null, "non-descending equal-time ID must be rejected");
  assert.equal(parse(page([row(1, "2026-10-15T10:01:00Z")]), before), null, "newer page must be rejected");
  assert.equal(parse(page([row(1, "2026-10-15T09:59:00Z")]), { ...before, event_id: "bad" }), null);
  assert.equal(parse(page([row(1, "2026-10-15T09:59:00Z")]), { ...before, created_at: "bad" }), null);
  assert.equal(parse(page([row(3, before.created_at)]))?.items.length, 1, "first page has no cursor boundary");

  const items = Array.from({ length: 20 }, (_, i) => row(i + 1, new Date(Date.UTC(2026, 9, 15, 9, 59 - i)).toISOString()));
  const last = items[items.length - 1];
  const next = { created_at: last.created_at, event_id: last.event_id };
  assert.equal(parse(page(items, next), before)?.nextCursor?.event_id, last.event_id);
  assert.equal(parse(page(items, { ...next, event_id: id(99) }), before), null);

  const ui = await readFile("src/components/PlatformAdminVenueCandidateDirectory.tsx", "utf8");
  assert.match(ui, /parseAdminVenueCandidatePage\(data, before\)/);
  assert.match(ui, /VENUE_CANDIDATE_PAGE_OVERLAP/);
  console.log("PASS V8 admin venue candidate cursor-boundary and overlap contract (11 checks)");
} finally {
  await rm(temp, { recursive: true, force: true });
}
