import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { createHash } from "node:crypto";

export function verifyEvidenceProvenance(manifest, root, expectedHead) {
  const errors = [];
  if (!/^[a-f0-9]{40}$/.test(expectedHead))
    errors.push("INVALID_EXPECTED_HEAD");
  if (
    !manifest ||
    manifest.schema !== "qd-mini-evidence-v1" ||
    manifest.head !== expectedHead
  )
    errors.push("HEAD_OR_SCHEMA_MISMATCH");
  if (!Array.isArray(manifest?.artifacts) || manifest.artifacts.length === 0)
    errors.push("EMPTY_ARTIFACTS");
  const seen = new Set();
  for (const item of Array.isArray(manifest?.artifacts)
    ? manifest.artifacts
    : []) {
    if (
      !item ||
      typeof item.path !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.sha256 ?? "")
    ) {
      errors.push("INVALID_ARTIFACT");
      continue;
    }
    const target = resolve(root, item.path);
    const rel = relative(resolve(root), target);
    if (
      isAbsolute(item.path) ||
      !rel ||
      rel === ".." ||
      rel.startsWith(".." + sep) ||
      isAbsolute(rel)
    ) {
      errors.push("UNSAFE_PATH");
      continue;
    }
    if (seen.has(rel)) {
      errors.push("DUPLICATE_PATH");
      continue;
    }
    seen.add(rel);
    try {
      const segments = rel.split(sep);
      let cursor = resolve(root);
      for (const segment of segments) {
        cursor = resolve(cursor, segment);
        if (lstatSync(cursor).isSymbolicLink()) throw new Error("SYMLINK");
      }
      if (!lstatSync(target).isFile() || realpathSync(target) !== target)
        throw new Error("NONREGULAR");
      const hash = createHash("sha256")
        .update(readFileSync(target))
        .digest("hex");
      if (hash !== item.sha256) errors.push("DIGEST_MISMATCH");
    } catch {
      errors.push("MISSING_OR_UNSAFE_FILE");
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href
) {
  const [manifestPath, root, expectedHead] = process.argv.slice(2);
  if (!manifestPath || !root || !expectedHead) {
    console.error(
      "Usage: node verify-evidence-provenance.mjs manifest.json repo-root exact-40-char-head",
    );
    process.exit(2);
  }
  try {
    const result = verifyEvidenceProvenance(
      JSON.parse(readFileSync(manifestPath, "utf8")),
      root,
      expectedHead,
    );
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error("INVALID_MANIFEST");
    process.exitCode = 1;
  }
}
