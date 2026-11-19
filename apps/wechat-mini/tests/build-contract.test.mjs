import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const read = (name) => readFileSync(resolve(root, name), "utf8");
const manifest = JSON.parse(read("package.json"));
const lines = (name) =>
  read(name)
    .split(/\r?\n/)
    .map((line) => line.trim());

test("Taro packages share an exact version and React 18 compatibility baseline", () => {
  const taro = Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  }).filter(([name]) => name.startsWith("@tarojs/"));
  assert.ok(
    taro.length >= 6,
    "expected explicit Taro runtime and build packages",
  );
  const versions = new Set(taro.map(([, version]) => version));
  assert.deepEqual([...versions], ["4.2.1"]);
  assert.equal(manifest.dependencies.react, "18.3.1");
  assert.equal(manifest.dependencies["react-dom"], "18.3.1");
  assert.match(manifest.devDependencies["@types/react"], /^18\./);
});

test("generated canonical H5 domain is excluded from Prettier and git, not TypeScript", () => {
  assert.ok(lines(".gitignore").includes("src/shared-domain/"));
  assert.ok(lines(".prettierignore").includes("src/shared-domain/"));
  assert.ok(manifest.scripts["format:check"].includes("prettier --check"));
  assert.ok(JSON.parse(read("tsconfig.json")).include.includes("src/**/*"));
  assert.match(read("scripts/sync-domain.mjs"), /src\/domain/);
});

test("isolated mini build does not introduce H5 or deployment side effects", () => {
  assert.match(manifest.scripts["build:weapp"], /taro build --type weapp/);
  assert.match(manifest.scripts["test:offline"], /tests\/\*\.test\.mjs/);
  assert.ok(
    !Object.keys(manifest.scripts).some((name) =>
      /deploy|publish|release|push/i.test(name),
    ),
  );
  assert.equal(JSON.parse(read("project.config.json")).appid, "touristappid");
  assert.equal(manifest.private, true);
});
