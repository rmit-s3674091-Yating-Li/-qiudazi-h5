import { existsSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const requiredFiles = ["app.json", "app.js", "pages/index/index.js"];

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
  for (const name of requiredFiles) checkedFile(dist, name);
  let app;
  try {
    app = JSON.parse(readFileSync(join(dist, "app.json"), "utf8"));
  } catch {
    throw new Error("G1_APP_JSON_INVALID");
  }
  if (!Array.isArray(app.pages) || !app.pages.includes("pages/index/index")) {
    throw new Error("G1_APP_PAGE_MISSING");
  }
  return Object.freeze({ requiredFiles: [...requiredFiles] });
}
