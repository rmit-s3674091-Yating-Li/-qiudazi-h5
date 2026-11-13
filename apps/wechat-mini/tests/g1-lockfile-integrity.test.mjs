import test from "node:test";
import assert from "node:assert/strict";
import { validateDirectLockIntegrity } from "../scripts/g1-lockfile-integrity.mjs";

const sha = `sha512-${Buffer.alloc(64, 17).toString("base64")}`;
const manifest = () => ({
  name: "qiudazi-wechat-mini-poc",
  version: "0.0.1",
  dependencies: { react: "18.3.1" },
  devDependencies: { "@tarojs/cli": "4.2.1" },
});
const lock = () => ({
  name: "qiudazi-wechat-mini-poc",
  version: "0.0.1",
  lockfileVersion: 3,
  packages: {
    "": {
      name: "qiudazi-wechat-mini-poc",
      version: "0.0.1",
      dependencies: { react: "18.3.1" },
      devDependencies: { "@tarojs/cli": "4.2.1" },
    },
    "node_modules/react": {
      version: "18.3.1",
      resolved: "https://registry.npmjs.org/react/-/react-18.3.1.tgz",
      integrity: sha,
    },
    "node_modules/@tarojs/cli": {
      version: "4.2.1",
      resolved: "https://registry.npmjs.org/@tarojs/cli/-/cli-4.2.1.tgz",
      integrity: sha,
    },
  },
});

test("valid exact pinned direct packages with HTTPS tarballs and sha512 are accepted", () => {
  assert.deepEqual(validateDirectLockIntegrity(manifest(), lock()), []);
});
test("missing direct scoped package fails closed", () => {
  const l = lock();
  delete l.packages["node_modules/@tarojs/cli"];
  assert.deepEqual(validateDirectLockIntegrity(manifest(), l), [
    "LOCK_DIRECT_MISSING: @tarojs/cli",
  ]);
});
test("direct version mismatch is rejected even when root manifest metadata agrees", () => {
  const l = lock();
  l.packages["node_modules/react"].version = "18.2.0";
  assert.ok(
    validateDirectLockIntegrity(manifest(), l).includes(
      "LOCK_DIRECT_VERSION_MISMATCH: react",
    ),
  );
});
test("HTTP and file tarball URLs cannot masquerade as locked registry artifacts", () => {
  for (const url of [
    "http://registry.npmjs.org/react/-/react-18.3.1.tgz",
    "file:../react.tgz",
  ]) {
    const l = lock();
    l.packages["node_modules/react"].resolved = url;
    assert.ok(
      validateDirectLockIntegrity(manifest(), l).includes(
        "LOCK_DIRECT_UNSAFE_RESOLVED: react",
      ),
    );
  }
});
test("query credentials, embedded userinfo and non-tarball URL are rejected", () => {
  for (const url of [
    "https://registry.npmjs.org/react/-/react.tgz?token=private",
    "https://user:pass@registry.npmjs.org/react/-/react.tgz",
    "https://registry.npmjs.org/react/latest",
  ]) {
    const l = lock();
    l.packages["node_modules/react"].resolved = url;
    assert.ok(
      validateDirectLockIntegrity(manifest(), l).includes(
        "LOCK_DIRECT_UNSAFE_RESOLVED: react",
      ),
    );
  }
});
test("missing, wrong digest size and malformed base64 integrity are rejected", () => {
  for (const integrity of [
    undefined,
    "sha512-AA==",
    "sha512-%%%",
    "sha1-AAAA",
  ]) {
    const l = lock();
    l.packages["node_modules/react"].integrity = integrity;
    assert.ok(
      validateDirectLockIntegrity(manifest(), l).includes(
        "LOCK_DIRECT_INVALID_INTEGRITY: react",
      ),
    );
  }
});
test("symlinked direct package is rejected", () => {
  const l = lock();
  l.packages["node_modules/react"].link = true;
  assert.ok(
    validateDirectLockIntegrity(manifest(), l).includes(
      "LOCK_DIRECT_MISSING: react",
    ),
  );
});
test("non-exact direct manifest version is rejected, not treated as a verified lock", () => {
  const m = manifest();
  m.dependencies.react = "^18.3.1";
  assert.ok(
    validateDirectLockIntegrity(m, lock()).includes(
      "LOCK_DIRECT_NOT_EXACT: react",
    ),
  );
});
test("missing lock graph fails closed", () => {
  assert.deepEqual(
    validateDirectLockIntegrity(manifest(), { lockfileVersion: 3 }),
    ["LOCK_DIRECT_GRAPH_UNAVAILABLE"],
  );
});
test("no direct dependencies keeps minimal mock fixtures compatible", () => {
  assert.deepEqual(
    validateDirectLockIntegrity(
      { dependencies: {}, devDependencies: {} },
      { lockfileVersion: 3, packages: { "": {} } },
    ),
    [],
  );
});

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectG1Readiness } from "../scripts/g1-gate.mjs";

function withPreflight(run) {
  const project = mkdtempSync(join(tmpdir(), "qd-mini-lock-preflight-"));
  try {
    mkdirSync(join(project, "node_modules/.bin"), { recursive: true });
    for (const name of ["taro", "tsc", "prettier"])
      writeFileSync(join(project, "node_modules/.bin", name), "");
    writeFileSync(join(project, "package.json"), JSON.stringify(manifest()));
    const l = lock();
    writeFileSync(join(project, "package-lock.json"), JSON.stringify(l));
    run(project, l);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

test("real G1 preflight accepts complete direct lock metadata in offline fixture", () =>
  withPreflight((project) => {
    assert.deepEqual(inspectG1Readiness(project), {
      ready: true,
      failures: [],
    });
  }));
test("real G1 preflight rejects a fake root-only lock even when root manifest matches", () =>
  withPreflight((project, l) => {
    delete l.packages["node_modules/react"];
    delete l.packages["node_modules/@tarojs/cli"];
    writeFileSync(join(project, "package-lock.json"), JSON.stringify(l));
    const result = inspectG1Readiness(project);
    assert.equal(result.ready, false);
    assert.ok(result.failures.includes("LOCK_DIRECT_MISSING: react"));
    assert.ok(result.failures.includes("LOCK_DIRECT_MISSING: @tarojs/cli"));
  }));
