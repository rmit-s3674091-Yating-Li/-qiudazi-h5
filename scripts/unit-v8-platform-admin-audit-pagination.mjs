import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temp = await mkdtemp(join(tmpdir(), "qiudazi-v8-audit-pagination-"));
try {
  const source = await readFile("src/domain/PlatformAdminAuditHistory.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PlatformAdminAuditHistory.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const modulePath = join(temp, "PlatformAdminAuditHistory.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { parseAdminAuditPage: parse } = await import(pathToFileURL(modulePath).href);

  const first = {
    id: "a1111111-1111-4111-8111-111111111113",
    actor_auth_user_id: "a2222222-2222-4222-8222-222222222222",
    action: "EVENT_CANCEL", target_kind: "event",
    target_id: "a3333333-3333-4333-8333-333333333333",
    reason: "Reviewed evidence", risk_level: "high",
    created_at: "2026-10-13T00:00:00.123456+00:00",
  };
  const second = { ...first, id: "a1111111-1111-4111-8111-111111111112",
    created_at: "2026-10-13T00:00:00.123455+00:00" };
  const third = { ...first, id: "a1111111-1111-4111-8111-111111111111",
    created_at: "2026-10-13T00:00:00.123454+00:00" };
  const cursor = (row) => ({ created_at: row.created_at, id: row.id });
  const page = (items, next_cursor = null) => ({ items, next_cursor });
  assert.deepEqual(parse(page([first, second], cursor(second))),
    { items: [first, second], nextCursor: cursor(second) });
  assert.deepEqual(parse(page([third]), cursor(second)),
    { items: [third], nextCursor: null });
  assert.deepEqual(parse(page([])), { items: [], nextCursor: null });
  assert.equal(parse(page([second, first])), null, "reversed microsecond order");
  assert.equal(parse(page([first, first])), null, "duplicate IDs within page");
  assert.equal(parse(page([first]), cursor(first)), null, "repeated page boundary");
  assert.equal(parse(page([second]), cursor(second)), null, "repeated cursor");
  assert.equal(parse(page([first], cursor(second))), null, "next cursor must be last row");
  assert.equal(parse(page([], cursor(first))), null, "empty page cannot advertise cursor");
  assert.equal(parse(page([third]), cursor(third), new Set([third.id])), null, "cross-page repeated ID");
  assert.equal(parse(page([first, second]), null, new Set([second.id])), null, "cross-page overlap");
  const sameMicrosecond = { ...first, id: second.id };
  assert.deepEqual(parse(page([sameMicrosecond, first])), null, "same-time ID order must descend");
  assert.deepEqual(parse(page([first, sameMicrosecond])), { items: [first, sameMicrosecond], nextCursor: null });
  const equivalentZone = { ...first, created_at: "2026-10-13T08:00:00.123456+08:00" };
  assert.equal(parse(page([equivalentZone]), cursor(first)), null, "same instant and ID must not advance");
  const ui = await readFile("src/components/PlatformAdminAuditHistory.tsx", "utf8");
  assert.match(ui, /parseAdminAuditPage\(data, before, priorIds\)/);
  assert.doesNotMatch(ui, /page\.items\.filter\(/, "overlap must not be hidden by deduplication");
  assert.match(ui, /setState\("failed"\)/, "invalid pages must clear sensitive rows");
  console.log("V8 Platform Admin audit pagination boundary contract passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
