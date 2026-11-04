#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function changedPaths(patch) {
  const paths = new Set();
  const lines = patch.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  let current = null;
  let phase = "outside";
  let oldSeen = false;
  let newSeen = false;
  let oldRemaining = 0;
  let newRemaining = 0;
  const finish = () => {
    if (current && (!oldSeen || !newSeen))
      throw new Error("INCOMPLETE_FILE_HEADER");
    if (phase === "hunk" && (oldRemaining !== 0 || newRemaining !== 0))
      throw new Error("INCOMPLETE_HUNK");
  };
  for (const line of lines) {
    if (phase === "hunk" && (oldRemaining > 0 || newRemaining > 0)) {
      if (line.startsWith("\\ No newline at end of file")) continue;
      const prefix = line[0];
      if (![" ", "+", "-"].includes(prefix))
        throw new Error("INVALID_HUNK_LINE");
      if (prefix !== "+") oldRemaining--;
      if (prefix !== "-") newRemaining--;
      if (oldRemaining < 0 || newRemaining < 0)
        throw new Error("HUNK_COUNT_OVERFLOW");
      continue;
    }
    if (line.startsWith("diff --git ")) {
      finish();
      oldSeen = false;
      newSeen = false;
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (!match || match[1] !== match[2])
        throw new Error("UNSUPPORTED_OR_RENAMED_PATH");
      const path = match[1];
      if (
        path.startsWith("/") ||
        path.split("/").some((s) => s === ".." || s === "." || s === "") ||
        /[\x00-\x1f]/.test(path)
      )
        throw new Error("UNSAFE_PATH");
      if (
        !path.startsWith("apps/wechat-mini/") &&
        !path.startsWith("docs/research/miniprogram/") &&
        !path.startsWith("docs/V8_")
      )
        throw new Error("OUT_OF_SCOPE_PATH");
      if (paths.has(path)) throw new Error("DUPLICATE_PATH_IN_PATCH");
      paths.add(path);
      current = path;
      phase = "header";
      continue;
    }
    if (
      /^(rename from|rename to|copy from|copy to|GIT binary patch|Binary files)( |$)/.test(
        line,
      )
    )
      throw new Error("UNSUPPORTED_PATCH_OPERATION");
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      if (!current || phase !== "header") throw new Error("ORPHAN_FILE_HEADER");
      const isOld = line.startsWith("--- ");
      const actual = line.slice(4);
      const expected = `${isOld ? "a" : "b"}/${current}`;
      if (actual !== expected && actual !== "/dev/null")
        throw new Error("FILE_HEADER_MISMATCH");
      if (isOld) {
        if (oldSeen) throw new Error("DUPLICATE_FILE_HEADER");
        oldSeen = true;
      } else {
        if (newSeen) throw new Error("DUPLICATE_FILE_HEADER");
        newSeen = true;
      }
      continue;
    }
    if (line.startsWith("@@ ")) {
      if (!oldSeen || !newSeen) throw new Error("INCOMPLETE_FILE_HEADER");
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(
        line,
      );
      if (!match) throw new Error("INVALID_HUNK_HEADER");
      oldRemaining = Number(match[2] ?? 1);
      newRemaining = Number(match[4] ?? 1);
      if (
        !Number.isSafeInteger(oldRemaining) ||
        !Number.isSafeInteger(newRemaining)
      )
        throw new Error("INVALID_HUNK_COUNT");
      phase = "hunk";
      continue;
    }
  }
  finish();
  if (paths.size === 0) throw new Error("EMPTY_PATCH");
  return paths;
}

export function analyze(patches) {
  const owners = new Map();
  const conflicts = [];
  for (const [name, source] of patches) {
    for (const path of changedPaths(source)) {
      if (owners.has(path))
        conflicts.push({ path, packages: [owners.get(path), name] });
      else owners.set(path, name);
    }
  }
  return {
    conflicts,
    totalUniquePaths: owners.size,
    safeToCombine: conflicts.length === 0,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  const files = process.argv.slice(2);
  if (files.length < 2) {
    console.error(
      "Usage: node check-patch-collisions.mjs packageA.patch packageB.patch [...]",
    );
    process.exitCode = 2;
  } else {
    try {
      const result = analyze(
        files.map((file) => [file, readFileSync(file, "utf8")]),
      );
      console.log(JSON.stringify(result, null, 2));
      if (!result.safeToCombine) process.exitCode = 1;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 2;
    }
  }
}
