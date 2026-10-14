import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "qiudazi-venue-reverse-hint-"));
try {
  const helper = await readFile(new URL("../src/domain/VenueSelection.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(helper, {
    fileName: "VenueSelection.ts",
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, "helper must transpile");
  const modulePath = join(dir, "VenueSelection.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { reverseLocationHint } = await import(pathToFileURL(modulePath).href);
  const candidate = {
    name: "Nearest unrelated cafe", address: "北京市朝阳区某街道",
    provider: "baidu", placeId: "unverified-poi-123", latitude: 39.9, longitude: 116.4,
  };
  assert.deepEqual(reverseLocationHint(candidate), {
    name: "", address: "北京市朝阳区某街道", provider: "baidu", placeId: null,
  }, "dragged pin must keep readable address but must not claim a venue name or POI ID");
  assert.equal(candidate.name, "Nearest unrelated cafe", "source provider data must not be mutated");
  assert.equal(reverseLocationHint({ ...candidate, address: "" }).address, "", "missing address must not fall back to guessed POI name");

  const picker = await readFile(new URL("../src/components/VenueMapPicker.tsx", import.meta.url), "utf8");
  assert.match(picker, /import \{ reverseLocationHint \} from "\.\.\/domain\/VenueSelection"/);
  assert.match(picker, /if\(seq!==lookupSeq\.current\)return;\s*if\(found\)setPlace\(reverseLocationHint\(found\)\);else setPlace\(null\);/);
  assert.doesNotMatch(picker, /setQuery\(q=>q\|\|found!\.name\)/, "reverse lookup must not populate a venue search query");
  assert.match(picker, /setPlace\(\{name:result\.name,address:result\.address,provider:result\.provider,placeId:result\.placeId\}\)/);
  console.log("PASS V8 reverse-geocode location hint / explicit POI distinction");
} finally {
  await rm(dir, { recursive: true, force: true });
}
