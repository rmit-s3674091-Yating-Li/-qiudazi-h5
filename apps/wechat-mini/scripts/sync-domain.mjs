import { copyFileSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = resolve(root, "apps/wechat-mini/src/shared-domain");
const names = [
  "types.ts",
  "ScoringEngine.ts",
  "QuickGroupConfig.ts",
  "ParticipantPointReceipt.ts",
  "AuthAccountGeneration.ts",
];

function statOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
function requireRealDirectory(path) {
  const stat = statOrNull(path);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("DOMAIN_SYNC_UNSAFE_DIRECTORY");
  }
}
function requireRealSource(path, name) {
  const stat = statOrNull(path);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`DOMAIN_SYNC_UNSAFE_SOURCE: ${name}`);
  }
}
function requireSafeDestination(path, name) {
  const stat = statOrNull(path);
  if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) {
    throw new Error(`DOMAIN_SYNC_UNSAFE_DESTINATION: ${name}`);
  }
}

// Fail before copying if a generated path can escape into H5 or another directory.
for (const dir of [
  root,
  resolve(root, "src"),
  resolve(root, "src/domain"),
  resolve(root, "apps"),
  resolve(root, "apps/wechat-mini"),
  resolve(root, "apps/wechat-mini/src"),
]) {
  requireRealDirectory(dir);
}
if (statOrNull(out)) requireRealDirectory(out);
else mkdirSync(out);

// Validate the entire copy plan before writing any file.
for (const name of names) {
  requireRealSource(resolve(root, "src/domain", name), name);
  requireSafeDestination(resolve(out, name), name);
}
const digest = (data) => createHash("sha256").update(data).digest("hex");
for (const name of names) {
  const source = resolve(root, "src/domain", name);
  const destination = resolve(out, name);
  copyFileSync(source, destination);
  if (digest(readFileSync(source)) !== digest(readFileSync(destination))) {
    throw new Error(`Domain mismatch: ${name}`);
  }
}
console.log(
  `Synced ${names.length} canonical H5 domain files (generated, ignored by git).`,
);
