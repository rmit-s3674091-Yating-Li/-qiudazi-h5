import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyG1BuildOutput } from "../scripts/g1-build-output.mjs";

const index = "pages/index/index";
const venue = "pages/venue-poc/index";

function fixture(source, pages = [index], appOverrides = {}) {
  const project = mkdtempSync(join(tmpdir(), "qd-g1-source-"));
  const dist = join(project, "dist");
  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(project, "src/app.config.ts"), source);
  for (const page of pages) {
    const file = join(project, "src", `${page}.tsx`);
    mkdirSync(join(project, "src", page.slice(0, page.lastIndexOf("/"))), {
      recursive: true,
    });
    writeFileSync(file, "export default function Page() { return null; }\n");
  }
  writeFileSync(
    join(dist, "app.json"),
    JSON.stringify({ pages, ...appOverrides }),
  );
  writeFileSync(join(dist, "app.js"), "mock app");
  for (const page of pages) {
    const directory = join(dist, page.slice(0, page.lastIndexOf("/")));
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(dist, `${page}.js`), "mock js");
    writeFileSync(join(dist, `${page}.wxml`), "<view>mock</view>");
  }
  return project;
}

function expectInvalid(
  source,
  code = /G1_SOURCE_PAGES_UNVERIFIED/,
  overrides = {},
) {
  const project = fixture(source, [index], overrides);
  try {
    assert.throws(() => verifyG1BuildOutput(project), code);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

test("a fake pages array in a block comment cannot mask dynamic config", () => {
  expectInvalid(`/*
  pages: ["${index}"]
*/
export default defineAppConfig({ pages: dynamicPages });`);
});

test("a fake pages array in a template string cannot mask dynamic config", () => {
  expectInvalid(`const note = \`
  pages: ["${index}"]
\`;
export default defineAppConfig({ pages: dynamicPages });`);
});

test("nested window.pages is not the root pages declaration", () => {
  expectInvalid(`export default defineAppConfig({
  window: {
    pages: ["${index}"],
  },
  pages: dynamicPages,
});`);
});

test("object spread cannot override a verified static pages array", () => {
  expectInvalid(`export default defineAppConfig({
  pages: ["${index}"],
  ...runtimeConfig,
});`);
});

test("computed property keys are not accepted in the app config", () => {
  expectInvalid(`export default defineAppConfig({
  pages: ["${index}"],
  ["pages"]: dynamicPages,
});`);
});

test("source subPackages cannot silently bypass full-page verification", () => {
  expectInvalid(`export default defineAppConfig({
  pages: ["${index}"],
  subPackages: [{ root: "extra", pages: ["index"] }],
});`);
});

test("built app.json subPackages must not bypass full-page verification", () => {
  expectInvalid(
    `export default defineAppConfig({
  pages: ["${index}"],
});`,
    /G1_APP_SUBPACKAGES_UNVERIFIED/,
    { subPackages: [{ root: "extra", pages: ["index"] }] },
  );
});

test("invalid TypeScript and multiple default exports are rejected", () => {
  expectInvalid(`export default defineAppConfig({ pages: ["${index}"] );`);
  expectInvalid(
    `export default defineAppConfig({ pages: ["${index}"] });
export default defineAppConfig({ pages: ["${index}"] });`,
  );
});

test("ordinary static multi-page config and window settings remain supported", () => {
  const source = `export default defineAppConfig({
  pages: ["${index}", "${venue}"],
  window: { navigationBarTitleText: "球搭子" },
});`;
  const project = fixture(source, [index, venue]);
  try {
    assert.equal(verifyG1BuildOutput(project).requiredFiles.length, 6);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
