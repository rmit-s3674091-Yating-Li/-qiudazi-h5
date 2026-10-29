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
function sourcePages(project, pages) {
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(
    join(project, "src/app.config.ts"),
    `export default defineAppConfig({\n  pages: [${pages.map((p) => JSON.stringify(p)).join(", ")}],\n});\n`,
  );
  for (const page of pages) {
    const file = join(project, "src", `${page}.tsx`);
    mkdirSync(join(project, "src", page.slice(0, page.lastIndexOf("/"))), {
      recursive: true,
    });
    writeFileSync(file, "export default function Page() { return null; }\n");
  }
}
function output(project, pages = ["pages/index/index"], registered = pages) {
  sourcePages(project, registered);
  const dist = join(project, "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "app.json"), JSON.stringify({ pages }));
  writeFileSync(join(dist, "app.js"), "mock app");
  for (const page of pages) {
    mkdirSync(join(dist, page.substring(0, page.lastIndexOf("/"))), {
      recursive: true,
    });
    writeFileSync(join(dist, `${page}.js`), "mock page");
    writeFileSync(join(dist, `${page}.wxml`), "<view>offline</view>");
  }
  return dist;
}

test("fresh valid app and page bundle is accepted", () =>
  withProject((project) => {
    output(project);
    assert.deepEqual(verifyG1BuildOutput(project).requiredFiles, [
      "app.json",
      "app.js",
      "pages/index/index.js",
      "pages/index/index.wxml",
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

test("source-registered additional pages must appear in built app manifest", () =>
  withProject((project) => {
    output(
      project,
      ["pages/index/index"],
      [
        "pages/index/index",
        "pages/venue-poc/index",
        "pages/event-create-route-poc/index",
        "pages/venue-route-poc/index",
      ],
    );
    assert.throws(
      () => verifyG1BuildOutput(project),
      /G1_APP_PAGE_MANIFEST_MISMATCH/,
    );
  }));

test("every declared page needs both JS and WXML, not just index JS", () =>
  withProject((project) => {
    const pages = ["pages/index/index", "pages/venue-route-poc/index"];
    const dist = output(project, pages);
    rmSync(join(dist, "pages/venue-route-poc/index.js"));
    assert.throws(
      () => verifyG1BuildOutput(project),
      /G1_BUILD_ARTIFACT_MISSING/,
    );
    writeFileSync(join(dist, "pages/venue-route-poc/index.js"), "mock");
    rmSync(join(dist, "pages/venue-route-poc/index.wxml"));
    assert.throws(
      () => verifyG1BuildOutput(project),
      /G1_BUILD_ARTIFACT_MISSING/,
    );
  }));

test("valid multi-page bundle reports all actual required page artifacts", () =>
  withProject((project) => {
    const pages = [
      "pages/index/index",
      "pages/venue-poc/index",
      "pages/venue-route-poc/index",
    ];
    output(project, pages);
    assert.deepEqual(verifyG1BuildOutput(project).requiredFiles, [
      "app.json",
      "app.js",
      "pages/index/index.js",
      "pages/index/index.wxml",
      "pages/venue-poc/index.js",
      "pages/venue-poc/index.wxml",
      "pages/venue-route-poc/index.js",
      "pages/venue-route-poc/index.wxml",
    ]);
  }));

test("source dynamic, duplicate and unsafe page declarations fail closed", () =>
  withProject((project) => {
    output(project);
    const source = join(project, "src/app.config.ts");
    for (const content of [
      "export default defineAppConfig({ pages: dynamicPages });",
      'export default defineAppConfig({ pages: ["pages/index/index", "pages/index/index"] });',
      'export default defineAppConfig({ pages: ["pages/index/index", "pages/../evil"] });',
    ]) {
      writeFileSync(source, content);
      assert.throws(
        () => verifyG1BuildOutput(project),
        /G1_SOURCE_PAGES_UNVERIFIED/,
      );
    }
  }));

test(
  "source page config cannot be a symlink or missing",
  { skip: process.platform === "win32" },
  () =>
    withProject((project) => {
      output(project);
      const source = join(project, "src/app.config.ts");
      rmSync(source);
      assert.throws(
        () => verifyG1BuildOutput(project),
        /G1_SOURCE_PAGE_CONFIG_UNAVAILABLE/,
      );
      symlinkSync(join(project, "dist/app.json"), source);
      assert.throws(
        () => verifyG1BuildOutput(project),
        /G1_SOURCE_PAGE_CONFIG_UNAVAILABLE/,
      );
    }),
);

test(
  "symlinked additional page WXML is not accepted as a build artifact",
  { skip: process.platform === "win32" },
  () =>
    withProject((project) => {
      const dist = output(project, [
        "pages/index/index",
        "pages/venue-route-poc/index",
      ]);
      const page = join(dist, "pages/venue-route-poc/index.wxml");
      rmSync(page);
      symlinkSync(join(dist, "pages/index/index.wxml"), page);
      assert.throws(
        () => verifyG1BuildOutput(project),
        /G1_BUILD_ARTIFACT_SYMLINK/,
      );
    }),
);

test("Prettier-style multiline source pages with trailing comma are recognized", () =>
  withProject((project) => {
    const pages = [
      "pages/index/index",
      "pages/venue-poc/index",
      "pages/event-create-poc/index",
      "pages/event-route-poc/index",
      "pages/venue-route-poc/index",
    ];
    output(project, pages);
    writeFileSync(
      join(project, "src/app.config.ts"),
      `export default defineAppConfig({\n  pages: [\n${pages.map((page) => `    "${page}",`).join("\n")}\n  ],\n});\n`,
    );
    assert.equal(verifyG1BuildOutput(project).requiredFiles.length, 12);
  }));
