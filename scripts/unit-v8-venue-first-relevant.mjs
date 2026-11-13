import { sourceContractText } from "./source-contract-text.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temp = await mkdtemp(join(tmpdir(), "qiudazi-v8-venue-first-relevant-"));
try {
  const source = await readFile("src/domain/VenueSearchResolution.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "VenueSearchResolution.ts",
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const output = join(temp, "resolution.mjs");
  await writeFile(output, compiled.outputText, "utf8");
  const { collectVenueSearch } = await import(pathToFileURL(output).href);
  const calls = [];
  const search = async (term) => {
    calls.push(term);
    return term === "first"
      ? [{ name: "real candidate" }]
      : [{ name: "fallback" }];
  };
  const relevant = (groups) =>
    groups.some((group) =>
      group.some((item) => item.name === "real candidate"),
    );
  const first = await collectVenueSearch(
    ["first", "redundant"],
    search,
    () => true,
    relevant,
  );
  assert.deepEqual(
    calls,
    ["first"],
    "avoid redundant slow network call after a relevant hit",
  );
  assert.equal(first.groups.length, 1);
  assert.equal(first.hadFailure, false);

  const fallbackCalls = [];
  const fallback = await collectVenueSearch(
    ["unrelated", "second", "redundant"],
    async (term) => {
      fallbackCalls.push(term);
      return [
        { name: term === "second" ? "real candidate" : "unrelated candidate" },
      ];
    },
    () => true,
    relevant,
  );
  assert.deepEqual(
    fallbackCalls,
    ["unrelated", "second"],
    "keep searching when first POI does not match user query",
  );
  assert.equal(fallback.groups.length, 2);

  const failed = await collectVenueSearch(
    ["upstream-failure", "fallback"],
    async (term) => {
      if (term === "upstream-failure")
        throw new Error("BAIDU_PLACE_HTTP_ERROR");
      return [{ name: "real candidate" }];
    },
    () => true,
    relevant,
  );
  assert.equal(failed.hadFailure, true, "do not mask a provider failure");
  assert.equal(failed.groups.length, 1);

  const cancelled = await collectVenueSearch(
    ["first", "redundant"],
    async () => {
      return [{ name: "real candidate" }];
    },
    () => false,
    relevant,
  );
  assert.equal(cancelled.cancelled, true);
  assert.deepEqual(cancelled.groups, []);

  const oldBehavior = await collectVenueSearch(["first", "redundant"], search);
  assert.equal(
    oldBehavior.groups.length,
    2,
    "existing callers keep collect-all default",
  );

  const picker = await readFile("src/components/VenueMapPicker.tsx", "utf8");
  assert.match(
    sourceContractText(picker),
    /groups=>rankPlaces\(mergePlaces\(groups\),term\)\.some\(item=>normalizeText\(item\.name\)===normalizeText\(term\)\)/,
    "picker stops only on exact name, not child POIs",
  );
  assert.match(sourceContractText(picker), /if\(cancelled\)return;/);
  console.log(
    "PASS: V8 P3 stop after relevant POI, preserve fallback, errors and cancellation",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
