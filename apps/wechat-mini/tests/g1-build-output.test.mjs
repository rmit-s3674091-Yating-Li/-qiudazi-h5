import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearG1BuildOutput,
  verifyG1BuildOutput,
} from "../scripts/g1-build-output.mjs";

function withProject(run) {
  const project = mkdtempSync(join(tmpdir(), "qd-mini-artifacts-"));
  try {
    run(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}
function output(project, pages = ["pages/index/index"]) {
  const dist = join(project, "dist");
  mkdirSync(join(dist, "pages/index"), { recursive: true });
  writeFileSync(join(dist, "app.json"), JSON.stringify({ pages }));
  writeFileSync(join(dist, "app.js"), "mock app");
  writeFileSync(join(dist, "pages/index/index.js"), "mock page");
  return dist;
}

test("fresh valid app and page bundle is accepted", () =>
  withProject((project) => {
    output(project);
    assert.deepEqual(verifyG1BuildOutput(project).requiredFiles, [
      "app.json",
      "app.js",
      "pages/index/index.js",
    ]);
  }));

test("a zero-exit build without output fails closed", () =>
  withProject((project) => {
    assert.throws(() => verifyG1BuildOutput(project), /G1_DIST_MISSING/);
  }));

test("missing, empty and invalid output cannot certify G1", () =>
  withProject((project) => {
    const dist = output(project);
    rmSync(join(dist, "pages/index/index.js"));
    assert.throws(
      () => verifyG1BuildOutput(project),
      /G1_BUILD_ARTIFACT_MISSING/,
    );
    writeFileSync(join(dist, "pages/index/index.js"), "");
    assert.throws(
      () => verifyG1BuildOutput(project),
      /G1_BUILD_ARTIFACT_INVALID/,
    );
    writeFileSync(join(dist, "pages/index/index.js"), "mock");
    writeFileSync(join(dist, "app.json"), "{invalid");
    assert.throws(() => verifyG1BuildOutput(project), /G1_APP_JSON_INVALID/);
  }));

test("app.json must declare the expected index page", () =>
  withProject((project) => {
    output(project, ["pages/other/other"]);
    assert.throws(() => verifyG1BuildOutput(project), /G1_APP_PAGE_MISSING/);
  }));

test(
  "symlinked dist and symlinked page output are rejected",
  { skip: process.platform === "win32" },
  () =>
    withProject((project) => {
      const external = join(project, "external");
      mkdirSync(external);
      symlinkSync(external, join(project, "dist"));
      assert.throws(() => clearG1BuildOutput(project), /G1_DIST_UNSAFE_PATH/);
      rmSync(join(project, "dist"));
      const dist = output(project);
      rmSync(join(dist, "pages/index/index.js"));
      symlinkSync(join(dist, "app.js"), join(dist, "pages/index/index.js"));
      assert.throws(
        () => verifyG1BuildOutput(project),
        /G1_BUILD_ARTIFACT_SYMLINK/,
      );
    }),
);

test("clean removes only the generated mini dist, not sibling H5 data", () =>
  withProject((project) => {
    output(project);
    const sibling = join(project, "h5-tracked.ts");
    writeFileSync(sibling, "do not change");
    clearG1BuildOutput(project);
    assert.equal(existsSync(join(project, "dist")), false);
    assert.equal(existsSync(sibling), true);
  }));
