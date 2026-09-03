import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const tmp = await mkdtemp(join(tmpdir(), "qiudazi-hall-unit-"));
let failures = 0;
function test(name, fn) { try { fn(); console.log(`✓ ${name}`); } catch (error) { failures += 1; console.error(`✗ ${name}`); console.error(error); } }

try {
  const source = await readFile(new URL("src/domain/HallFilters.ts", root), "utf8");
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, fileName: "HallFilters.ts" });
  const output = join(tmp, "HallFilters.js");
  await writeFile(output, result.outputText, "utf8");
  const hall = await import(pathToFileURL(output).href + `?v=${Date.now()}`);

  test("city normalization applies NFKC trim and case folding", () => {
    assert.equal(hall.normalizeHallCity("  ＳＨＡＮＧＨＡＩ  "), "shanghai");
    assert.equal(hall.normalizeHallCity(" 上海 "), "上海");
  });
  test("empty city filter keeps events with and without city discoverable", () => {
    assert.equal(hall.matchesHallFilters({ city: null }, { city: "" }), true);
    assert.equal(hall.matchesHallFilters({ city: "上海" }, { city: "   " }), true);
  });
  test("explicit city filter excludes blank and other-city events", () => {
    assert.equal(hall.matchesHallFilters({ city: null }, { city: "上海" }), false);
    assert.equal(hall.matchesHallFilters({ city: "北京" }, { city: "上海" }), false);
    assert.equal(hall.matchesHallFilters({ city: " 上海 " }, { city: "上海" }), true);
  });
  test("city composes deterministically with match type level and date", () => {
    const event = { city: "上海", match_type: "singles", level: "3.0", event_date: "2026-09-04" };
    assert.equal(hall.matchesHallFilters(event, { city: "上海", matchType: "singles", level: "3.0", date: "2026-09-04" }), true);
    assert.equal(hall.matchesHallFilters(event, { city: "上海", matchType: "doubles", level: "3.0", date: "2026-09-04" }), false);
    assert.equal(hall.matchesHallFilters(event, { city: "上海", matchType: "singles", level: "3.5", date: "2026-09-04" }), false);
    assert.equal(hall.matchesHallFilters(event, { city: "上海", matchType: "singles", level: "3.0", date: "2026-09-05" }), false);
  });

  if (failures) process.exitCode = 1;
  else console.log("All Hall filter unit tests passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
