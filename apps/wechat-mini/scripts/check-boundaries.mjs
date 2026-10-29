import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const defaultSrcRoot = resolve(
  fileURLToPath(new URL("../src/", import.meta.url)),
);
const forbidden = [
  /(?:\bwindow\.|\bdocument\.|\blocalStorage\b)/,
  /(?:service_role|AppSecret|session_key)/,
  /src\/repositories\/supabase/,
];

/**
 * The network guard must be able to recognize the literal `session_key` as a
 * FORBIDDEN URL parameter. That defensive spelling is not a credential use.
 * Mask exactly one quoted entry inside the named denylist, nowhere else.
 * Any other occurrence of session_key still fails the boundary scan.
 */
function maskDefensiveQueryKey(source, relativePath) {
  if (relativePath !== "core/trusted-endpoint.ts") return source;
  const match = /const forbiddenQueryKeys\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(
    source,
  );
  if (!match) return source;
  const body = match[1];
  const literal = /(['"])session_key\1/g;
  const matches = [...body.matchAll(literal)];
  if (matches.length !== 1) return source;
  const maskedBody = body.replace(literal, "'_defensive_query_key_'");
  return (
    source.slice(0, match.index) +
    match[0].replace(body, maskedBody) +
    source.slice(match.index + match[0].length)
  );
}

/**
 * React/TS source can import browser-only packages without mentioning window
 * or document. Parse actual module references rather than matching comments.
 * This is an offline PoC compatibility gate, not a dependency security audit.
 */
const browserOnlyPackages = [
  "react-router-dom",
  "react-router",
  "react-dom",
  "leaflet",
  "react-leaflet",
  "@supabase/supabase-js",
  "vite",
];
const localRequire = createRequire(import.meta.url);

function checkBrowserOnlyImports(source, relativePath) {
  const ts = localRequire("typescript"); // Existing pinned devDependency.
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const checkSpecifier = (literal) => {
    if (!literal || !ts.isStringLiteralLike(literal)) {
      throw new Error(`Mini dynamic import unverified: ${relativePath}`);
    }
    const specifier = literal.text;
    if (
      browserOnlyPackages.some(
        (name) => specifier === name || specifier.startsWith(`${name}/`),
      )
    ) {
      throw new Error(
        `Mini browser-only import: ${relativePath} -> ${specifier}`,
      );
    }
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) checkSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      checkSpecifier(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      if (node.arguments.length !== 1) {
        throw new Error(`Mini dynamic import unverified: ${relativePath}`);
      }
      checkSpecifier(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

export function checkMiniBoundaries(srcRoot = defaultSrcRoot) {
  const root = resolve(srcRoot);
  if (lstatSync(root).isSymbolicLink())
    throw new Error("Mini boundary symlink: source root");
  let checked = 0;
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      const relativePath = relative(root, file).split(sep).join("/");
      if (entry.isSymbolicLink())
        throw new Error(`Mini boundary symlink: ${relativePath}`);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /\.tsx?$/.test(file)) {
        const source = readFileSync(file, "utf8");
        const inspected = maskDefensiveQueryKey(source, relativePath);
        if (forbidden.some((rule) => rule.test(inspected))) {
          throw new Error(`Mini boundary violation: ${relativePath}`);
        }
        checkBrowserOnlyImports(source, relativePath);
        checked++;
      }
    }
  }
  walk(root);
  return checked;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const checked = checkMiniBoundaries();
  console.log(
    `Mini platform boundary static check passed (${checked} files; not a security audit).`,
  );
}
