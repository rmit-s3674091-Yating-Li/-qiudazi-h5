import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temp = await mkdtemp(join(tmpdir(), "qiudazi-v8-picker-location-feedback-"));
try {
  const source = await readFile("src/domain/VenueGeolocationFeedback.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "VenueGeolocationFeedback.ts", reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, "feedback helper transpiles");
  const output = join(temp, "feedback.mjs");
  await writeFile(output, compiled.outputText, "utf8");
  const { venueGeolocationFeedback } = await import(pathToFileURL(output).href);
  const cases = [
    ["GEOLOCATION_DENIED", /permission was not granted/i, /未获得定位权限/],
    ["GEOLOCATION_UNAVAILABLE", /device could not determine/i, /设备无法获取位置/],
    ["GEOLOCATION_TIMEOUT", /timed out/i, /定位超时/],
  ];
  for (const [code, english, chinese] of cases) {
    assert.match(venueGeolocationFeedback(new Error(code), true), english);
    assert.match(venueGeolocationFeedback(new Error(code), false), chinese);
  }
  assert.doesNotMatch(venueGeolocationFeedback(new Error("GEOLOCATION_TIMEOUT"), true), /permission/i);
  assert.doesNotMatch(venueGeolocationFeedback(new Error("GEOLOCATION_UNAVAILABLE"), false), /权限/);
  assert.match(venueGeolocationFeedback(new Error("UNKNOWN"), true), /search/i);
  assert.match(venueGeolocationFeedback(null, false), /搜索场馆/);
  const picker = await readFile("src/components/VenueMapPicker.tsx", "utf8");
  assert.match(picker, /browserMapProvider\.getCurrentPosition\(\)\.then\(coords=>/);
  assert.match(picker, /if\(seq!==locationSeq\.current\)return;/);
  assert.match(picker, /if\(seq===locationSeq\.current\)setError\(venueGeolocationFeedback\(error,en\)\)/);
  assert.doesNotMatch(picker, /navigator\.geolocation\.getCurrentPosition\(/,
    "picker must not bypass shared provider geolocation error classification");
  console.log("PASS: V8 picker location denial, timeout, unavailable, unknown and stale-intent feedback");
} finally {
  await rm(temp, { recursive: true, force: true });
}
