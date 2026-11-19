import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyG1BuildOutput } from "../scripts/g1-build-output.mjs";

const pages = ["pages/index/index", "pages/venue-route-poc/index"];

function withBundle(run) {
  const root = mkdtempSync(join(tmpdir(), "qd-mini-source-page-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "src/app.config.ts"),
      `export default defineAppConfig({ pages: ${JSON.stringify(pages)} });\n`,
    );
    writeFileSync(join(root, "h5-unchanged.ts"), "H5 is not modified");
    const dist = join(root, "dist");
    mkdirSync(dist);
    writeFileSync(join(dist, "app.json"), JSON.stringify({ pages }));
    writeFileSync(join(dist, "app.js"), "mock app");
    for (const page of pages) {
      mkdirSync(join(dist, page.substring(0, page.lastIndexOf("/"))), {
        recursive: true,
      });
      writeFileSync(join(dist, `${page}.js`), "mock compiled js");
      writeFileSync(join(dist, `${page}.wxml`), "<view>mock</view>");
      const source = join(root, "src", `${page}.tsx`);
      mkdirSync(join(root, "src", page.substring(0, page.lastIndexOf("/"))), {
        recursive: true,
      });
      writeFileSync(
        source,
        "export default function Page() { return null; }\n",
      );
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const routeSource = (root) => join(root, "src/pages/venue-route-poc/index.tsx");

test("registered route with a real TSX source and built artifacts passes", () =>
  withBundle((root) => {
    assert.equal(verifyG1BuildOutput(root).requiredFiles.length, 6);
  }));

test("a built route without its TSX source cannot certify G1", () =>
  withBundle((root) => {
    rmSync(routeSource(root));
    assert.throws(
      () => verifyG1BuildOutput(root),
      /G1_SOURCE_PAGE_UNAVAILABLE: pages\/venue-route-poc\/index/,
    );
  }));

test("an empty TSX source cannot certify G1", () =>
  withBundle((root) => {
    writeFileSync(routeSource(root), "");
    assert.throws(
      () => verifyG1BuildOutput(root),
      /G1_SOURCE_PAGE_UNAVAILABLE/,
    );
  }));

test("a directory at the TSX source path is not accepted", () =>
  withBundle((root) => {
    rmSync(routeSource(root));
    mkdirSync(routeSource(root));
    assert.throws(
      () => verifyG1BuildOutput(root),
      /G1_SOURCE_PAGE_UNAVAILABLE/,
    );
  }));

test(
  "a symlinked TSX file cannot certify G1",
  { skip: process.platform === "win32" },
  () =>
    withBundle((root) => {
      rmSync(routeSource(root));
      symlinkSync(join(root, "h5-unchanged.ts"), routeSource(root));
      assert.throws(
        () => verifyG1BuildOutput(root),
        /G1_SOURCE_PAGE_UNAVAILABLE/,
      );
    }),
);

test(
  "a symlinked source page directory cannot certify G1",
  { skip: process.platform === "win32" },
  () =>
    withBundle((root) => {
      rmSync(join(root, "src/pages/venue-route-poc"), { recursive: true });
      symlinkSync(
        join(root, "src/pages/index"),
        join(root, "src/pages/venue-route-poc"),
      );
      assert.throws(
        () => verifyG1BuildOutput(root),
        /G1_SOURCE_PAGE_UNAVAILABLE/,
      );
    }),
);
