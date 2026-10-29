import { existsSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const coreArtifacts = ["app.json", "app.js"];
const safePage = /^pages\/[a-z0-9-]+\/[a-z0-9-]+$/;

/**
 * Read the actual default-exported config syntax tree, never a comment or a
 * string that happens to contain a `pages: [...]` lookalike. This runs only
 * after G1 preflight, so the existing TypeScript dev dependency is available.
 */
function readDeclaredPages(projectDir) {
  let source;
  let sourcePath;
  try {
    sourcePath = checkedFile(projectDir, "src/app.config.ts");
    source = readFileSync(sourcePath, "utf8");
  } catch {
    throw new Error("G1_SOURCE_PAGE_CONFIG_UNAVAILABLE");
  }
  const fail = () => {
    throw new Error("G1_SOURCE_PAGES_UNVERIFIED");
  };
  // Lazy load preserves the dependency-free `preflight:g1` error reporting.
  let ts;
  try {
    ts = createRequire(import.meta.url)("typescript");
  } catch {
    return fail();
  }
  const file = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (file.parseDiagnostics.length !== 0 || file.statements.length !== 1) {
    return fail();
  }
  const statement = file.statements[0];
  if (!ts.isExportAssignment(statement) || statement.isExportEquals) {
    return fail();
  }
  const call = statement.expression;
  if (
    !ts.isCallExpression(call) ||
    !ts.isIdentifier(call.expression) ||
    call.expression.text !== "defineAppConfig" ||
    call.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(call.arguments[0])
  ) {
    return fail();
  }
  let pages;
  const keys = new Set();
  for (const property of call.arguments[0].properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ) {
      return fail();
    }
    const key = property.name.text;
    if (keys.has(key) || key === "subPackages" || key === "subpackages") {
      return fail();
    }
    keys.add(key);
    if (key === "pages") {
      if (!ts.isArrayLiteralExpression(property.initializer)) return fail();
      pages = property.initializer.elements.map((item) => {
        if (!ts.isStringLiteral(item)) return fail();
        return item.text;
      });
    }
  }
  if (
    !pages ||
    pages.length === 0 ||
    !pages.includes("pages/index/index") ||
    new Set(pages).size !== pages.length ||
    pages.some((page) => !safePage.test(page))
  ) {
    return fail();
  }
  return pages;
}

function checkedFile(dist, relativePath) {
  let current = dist;
  const segments = relativePath.split("/");
  for (let index = 0; index < segments.length; index++) {
    current = join(current, segments[index]);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      throw new Error(`G1_BUILD_ARTIFACT_MISSING: ${relativePath}`);
    }
    if (stat.isSymbolicLink())
      throw new Error(`G1_BUILD_ARTIFACT_SYMLINK: ${relativePath}`);
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error(`G1_BUILD_ARTIFACT_INVALID: ${relativePath}`);
    }
    if (index === segments.length - 1 && (!stat.isFile() || stat.size === 0)) {
      throw new Error(`G1_BUILD_ARTIFACT_INVALID: ${relativePath}`);
    }
  }
  return current;
}

/** Delete ONLY the independent mini app's generated dist before compilation. */
export function clearG1BuildOutput(projectDir) {
  const dist = resolve(projectDir, "dist");
  if (!existsSync(dist)) return;
  const stat = lstatSync(dist);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("G1_DIST_UNSAFE_PATH");
  }
  rmSync(dist, { recursive: true, force: true });
}

/** A zero exit code alone is not evidence that a WeChat mini bundle exists. */
export function verifyG1BuildOutput(projectDir) {
  const dist = resolve(projectDir, "dist");
  let stat;
  try {
    stat = lstatSync(dist);
  } catch {
    throw new Error("G1_DIST_MISSING");
  }
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("G1_DIST_UNSAFE_PATH");
  for (const name of coreArtifacts) checkedFile(dist, name);
  let app;
  try {
    app = JSON.parse(readFileSync(join(dist, "app.json"), "utf8"));
  } catch {
    throw new Error("G1_APP_JSON_INVALID");
  }
  if (!Array.isArray(app.pages) || !app.pages.includes("pages/index/index")) {
    throw new Error("G1_APP_PAGE_MISSING");
  }
  if ("subPackages" in app || "subpackages" in app) {
    throw new Error("G1_APP_SUBPACKAGES_UNVERIFIED");
  }
  const sourcePages = readDeclaredPages(projectDir);
  if (
    app.pages.length !== sourcePages.length ||
    sourcePages.some((page, index) => app.pages[index] !== page)
  ) {
    throw new Error("G1_APP_PAGE_MANIFEST_MISMATCH");
  }
  // Each registered route must have its own real TSX source, not just an
  // app.json entry and potentially stale generated JS/WXML artifacts.
  for (const page of sourcePages) {
    try {
      checkedFile(projectDir, `src/${page}.tsx`);
    } catch {
      throw new Error(`G1_SOURCE_PAGE_UNAVAILABLE: ${page}`);
    }
  }
  const requiredFiles = [...coreArtifacts];
  for (const page of sourcePages) {
    for (const suffix of [".js", ".wxml"]) {
      const file = `${page}${suffix}`;
      checkedFile(dist, file);
      requiredFiles.push(file);
    }
  }
  return Object.freeze({ requiredFiles });
}
