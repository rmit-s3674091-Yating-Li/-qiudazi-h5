#!/usr/bin/env node
// Offline evidence-file integrity check; no credentials or network access.
import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const SHA = /^[a-f0-9]{64}$/;
const HEAD = /^[a-f0-9]{40}$/;
export function verifyLocalEvidence(manifest, root, expectedHead) {
  if (
    !HEAD.test(expectedHead) ||
    !manifest ||
    manifest.schemaVersion !== 1 ||
    manifest.exactHead !== expectedHead ||
    !Array.isArray(manifest.files)
  )
    throw Error("invalid manifest/head");
  if (manifest.files.length === 0 || manifest.files.length > 200)
    throw Error("invalid file count");
  const base = realpathSync(root);
  const seen = new Set();
  const verified = [];
  for (const entry of manifest.files) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !entry.path ||
      isAbsolute(entry.path) ||
      entry.path.includes("\\") ||
      entry.path.split("/").some((x) => x === ".." || x === "." || x === "") ||
      !SHA.test(entry.sha256)
    )
      throw Error("invalid path/digest");
    if (seen.has(entry.path)) throw Error("duplicate path");
    seen.add(entry.path);
    const candidate = resolve(base, entry.path);
    const rel = relative(base, candidate);
    if (!rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel))
      throw Error("path escapes root");
    // Reject symlinks at every component, not only the leaf.
    let part = base;
    for (const segment of entry.path.split("/")) {
      part = resolve(part, segment);
      if (lstatSync(part).isSymbolicLink()) throw Error("symlink forbidden");
    }
    if (!lstatSync(candidate).isFile()) throw Error("not regular file");
    const bytes = readFileSync(candidate);
    if (bytes.length > 10_000_000) throw Error("oversized evidence");
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== entry.sha256) throw Error("digest mismatch: " + entry.path);
    verified.push({ path: entry.path, sha256: digest });
  }
  return {
    status: "LOCAL_BYTES_VERIFIED_ONLY",
    exactHead: expectedHead,
    files: verified,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const [manifestFile, root, head] = process.argv.slice(2);
    if (!manifestFile || !root || !head)
      throw Error(
        "usage: node verify-local-evidence.mjs manifest.json root exactHead",
      );
    process.stdout.write(
      JSON.stringify(
        verifyLocalEvidence(
          JSON.parse(readFileSync(manifestFile, "utf8")),
          root,
          head,
        ),
        null,
        2,
      ) + "\n",
    );
  } catch (err) {
    process.stderr.write(String(err.message) + "\n");
    process.exitCode = 2;
  }
}
