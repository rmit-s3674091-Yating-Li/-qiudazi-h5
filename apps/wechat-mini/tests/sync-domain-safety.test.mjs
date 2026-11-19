import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
  linkSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const names = [
  "types.ts",
  "ScoringEngine.ts",
  "QuickGroupConfig.ts",
  "ParticipantPointReceipt.ts",
  "AuthAccountGeneration.ts",
];
const script = readFileSync(
  new URL("../scripts/sync-domain.mjs", import.meta.url),
  "utf8",
);
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "qd-mini-domain-"));
  try {
    const scripts = join(root, "apps/wechat-mini/scripts");
    const miniSrc = join(root, "apps/wechat-mini/src");
    const source = join(root, "src/domain");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(miniSrc, { recursive: true });
    mkdirSync(source, { recursive: true });
    for (const name of names)
      writeFileSync(join(source, name), `export const source = '${name}'\n`);
    writeFileSync(join(scripts, "sync-domain.mjs"), script);
    // A temp fixture has no package.json; force the same ESM mode as the app.
    writeFileSync(
      join(root, "apps/wechat-mini/package.json"),
      '{"type":"module"}',
    );
    run({
      root,
      source,
      miniSrc,
      runSync: () =>
        spawnSync("node", [join(scripts, "sync-domain.mjs")], {
          encoding: "utf8",
        }),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("copies five canonical files without changing H5 source", () =>
  fixture(({ source, miniSrc, runSync }) => {
    const result = runSync();
    assert.equal(result.status, 0, result.stderr);
    for (const name of names) {
      assert.equal(
        readFileSync(join(miniSrc, "shared-domain", name), "utf8"),
        readFileSync(join(source, name), "utf8"),
      );
    }
  }));

test(
  "rejects symlinked generated directory before copying",
  { skip: process.platform === "win32" },
  () =>
    fixture(({ source, miniSrc, runSync }) => {
      symlinkSync(source, join(miniSrc, "shared-domain"));
      const result = runSync();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /DOMAIN_SYNC_UNSAFE_DIRECTORY/);
    }),
);

test(
  "rejects symlinked destination file before copying any file",
  { skip: process.platform === "win32" },
  () =>
    fixture(({ source, miniSrc, runSync }) => {
      const generated = join(miniSrc, "shared-domain");
      mkdirSync(generated);
      symlinkSync(
        join(source, "ScoringEngine.ts"),
        join(generated, "ScoringEngine.ts"),
      );
      const original = readFileSync(join(source, "ScoringEngine.ts"), "utf8");
      const result = runSync();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /DOMAIN_SYNC_UNSAFE_DESTINATION/);
      assert.equal(
        readFileSync(join(source, "ScoringEngine.ts"), "utf8"),
        original,
      );
      assert.equal(existsSync(join(generated, "types.ts")), false);
    }),
);

test(
  "a symlink cannot overwrite a file outside generated mini output",
  { skip: process.platform === "win32" },
  () =>
    fixture(({ root, miniSrc, runSync }) => {
      const generated = join(miniSrc, "shared-domain");
      mkdirSync(generated);
      const victim = join(root, "h5-victim.ts");
      writeFileSync(victim, "H5_TRACKED_DO_NOT_TOUCH");
      symlinkSync(victim, join(generated, "types.ts"));
      const result = runSync();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /DOMAIN_SYNC_UNSAFE_DESTINATION/);
      assert.equal(readFileSync(victim, "utf8"), "H5_TRACKED_DO_NOT_TOUCH");
    }),
);

test("rejects hardlinked destination file to protect H5 tracked files", () =>
  fixture(({ source, miniSrc, runSync }) => {
    const generated = join(miniSrc, "shared-domain");
    mkdirSync(generated);
    linkSync(
      join(source, "ScoringEngine.ts"),
      join(generated, "ScoringEngine.ts"),
    );
    const result = runSync();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DOMAIN_SYNC_UNSAFE_DESTINATION/);
  }));

test(
  "rejects symlinked H5 canonical source",
  { skip: process.platform === "win32" },
  () =>
    fixture(({ source, runSync }) => {
      rmSync(join(source, "types.ts"));
      symlinkSync(join(source, "ScoringEngine.ts"), join(source, "types.ts"));
      const result = runSync();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /DOMAIN_SYNC_UNSAFE_SOURCE/);
    }),
);

test(
  "rejects a symlinked parent directory before generating output",
  { skip: process.platform === "win32" },
  () =>
    fixture(({ root, miniSrc, runSync }) => {
      const srcDir = join(root, "src");
      const other = join(root, "external");
      mkdirSync(other);
      // Rename src so the symlink is a parent in the canonical path.
      renameSync(srcDir, join(other, "original-src"));
      symlinkSync(join(other, "original-src"), srcDir);
      const result = runSync();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /DOMAIN_SYNC_UNSAFE_DIRECTORY/);
    }),
);
