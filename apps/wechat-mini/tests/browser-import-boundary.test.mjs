import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkMiniBoundaries } from "../scripts/check-boundaries.mjs";

function withSource(source, run, file = "pages/sample/index.tsx") {
  const root = mkdtempSync(join(tmpdir(), "qd-mini-import-boundary-"));
  try {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const [description, source] of [
  [
    "React Router static import",
    'import { useNavigate } from "react-router-dom";',
  ],
  [
    "Leaflet subpath import",
    'import icon from "leaflet/dist/images/marker-icon.png";',
  ],
  [
    "Supabase SDK type-only import",
    'import type { User } from "@supabase/supabase-js";',
  ],
  ["React DOM side-effect import", 'import "react-dom/client";'],
  ["Vite re-export", 'export { defineConfig } from "vite";'],
  ["dynamic import", 'const router = import("react-router-dom");'],
  ["CommonJS require", 'const map = require("leaflet");'],
  ["TS import equals", 'import router = require("react-router-dom");'],
]) {
  test(`rejects browser-only ${description}`, () => {
    withSource(source, (root) => {
      assert.throws(
        () => checkMiniBoundaries(root),
        /Mini browser-only import:/,
      );
    });
  });
}

test("nonliteral dynamic import fails closed", () => {
  withSource("const moduleName = getName(); import(moduleName);", (root) => {
    assert.throws(
      () => checkMiniBoundaries(root),
      /Mini dynamic import unverified:/,
    );
  });
});

test("nonliteral require fails closed", () => {
  withSource("const moduleName = getName(); require(moduleName);", (root) => {
    assert.throws(
      () => checkMiniBoundaries(root),
      /Mini dynamic import unverified:/,
    );
  });
});

test("safe Taro imports and relative pure domain imports are allowed", () => {
  withSource(
    'import Taro from "@tarojs/taro"; import type { X } from "../../core/ports.ts"; export const x = 1;',
    (root) => assert.equal(checkMiniBoundaries(root), 1),
  );
});

test("comments and ordinary strings do not create false browser imports", () => {
  withSource(
    '// import x from "react-router-dom"\nconst example = "import from leaflet"; export const ok = true;',
    (root) => assert.equal(checkMiniBoundaries(root), 1),
  );
});

test("similarly named safe packages are not rejected by substring matching", () => {
  withSource(
    'import x from "react-router-dom-compat"; export { x };',
    (root) => {
      assert.equal(checkMiniBoundaries(root), 1);
    },
  );
});
