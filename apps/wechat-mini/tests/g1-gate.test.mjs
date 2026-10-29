import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectG1Readiness, runG1Gate } from "../scripts/g1-gate.mjs";

function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "mini-g1-"));
  const manifest = {
    name: "qiudazi-wechat-mini-poc",
    version: "0.0.1",
    dependencies: { "@tarojs/taro": "4.2.1" },
    devDependencies: { typescript: "5.9.3" },
  };
  const lock = { lockfileVersion: 3, packages: { "": { ...manifest } } };
  // Valid fixture metadata for the strengthened direct-dependency preflight.
  // These are synthetic test entries, never the application's npm lockfile.
  for (const [name, version] of Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })) {
    lock.packages[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/fixture-${version}.tgz`,
      integrity: `sha512-${Buffer.alloc(64, 17).toString("base64")}`,
    };
  }
  try {
    return fn(dir, manifest, lock);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const write = (dir, name, content) =>
  writeFileSync(join(dir, name), JSON.stringify(content));
const installBins = (dir) => {
  mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
  for (const name of ["taro", "tsc", "prettier"])
    writeFileSync(join(dir, "node_modules", ".bin", name), "");
};

test("a missing lockfile blocks G1, even when local executables exist", () =>
  fixture((dir, manifest) => {
    write(dir, "package.json", manifest);
    installBins(dir);
    assert.ok(
      inspectG1Readiness(dir).failures.includes(
        "MISSING_OR_INVALID_PACKAGE_LOCK_JSON",
      ),
    );
    assert.equal(runG1Gate(dir, true), 2);
  }));

test("manifest drift and stale lockfile cannot be called build-ready", () =>
  fixture((dir, manifest, lock) => {
    write(dir, "package.json", manifest);
    lock.packages[""].dependencies["@tarojs/taro"] = "4.1.0";
    write(dir, "package-lock.json", lock);
    installBins(dir);
    assert.ok(
      inspectG1Readiness(dir).failures.includes("LOCKFILE_MANIFEST_MISMATCH"),
    );
  }));

test("preflight refuses missing build executables", () =>
  fixture((dir, manifest, lock) => {
    write(dir, "package.json", manifest);
    write(dir, "package-lock.json", lock);
    assert.equal(inspectG1Readiness(dir).ready, false);
    assert.ok(
      inspectG1Readiness(dir).failures.includes(
        "DEPENDENCY_NOT_INSTALLED_TARO",
      ),
    );
  }));

test("ready preflight does not claim compilation, login or publication", () =>
  fixture((dir, manifest, lock) => {
    write(dir, "package.json", manifest);
    write(dir, "package-lock.json", lock);
    installBins(dir);
    assert.deepEqual(inspectG1Readiness(dir), { ready: true, failures: [] });
    assert.equal(runG1Gate(dir, true), 0);
  }));
