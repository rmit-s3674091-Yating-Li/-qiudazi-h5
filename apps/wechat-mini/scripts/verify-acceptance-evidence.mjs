#!/usr/bin/env node
// Offline, fail-closed evidence classifier. Never reads credentials or calls a service.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const GATES = Object.freeze({
  source: [
    "exactHead",
    "gitApply",
    "typecheck",
    "format",
    "taroBuild",
    "h5Regression",
  ],
  auth: [
    "wechatCodeVerified",
    "trustedExchange",
    "supabaseRefresh",
    "revokeAndReplay",
    "legacyBinding",
    "rlsAndAdmin",
  ],
  release: [
    "appIdAndOwner",
    "serviceCategory",
    "filing",
    "privacy",
    "legalDomains",
    "deviceAndReview",
  ],
});
const STATES = new Set(["PASS", "FAIL", "UNVERIFIED"]);
export function classify(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("invalid evidence");
  if (
    input.schemaVersion !== 1 ||
    typeof input.exactHead !== "string" ||
    !/^[a-f0-9]{40}$/.test(input.exactHead)
  )
    throw Error("invalid schema/head");
  if (
    !input.evidence ||
    typeof input.evidence !== "object" ||
    Array.isArray(input.evidence)
  )
    throw Error("missing evidence");
  const allowed = new Set(Object.values(GATES).flat());
  for (const key of Object.keys(input.evidence))
    if (!allowed.has(key)) throw Error(`unknown evidence key: ${key}`);
  const result = {};
  for (const [group, keys] of Object.entries(GATES)) {
    result[group] = "PASS";
    for (const key of keys) {
      const entry = input.evidence[key];
      if (
        !entry ||
        typeof entry !== "object" ||
        !STATES.has(entry.status) ||
        typeof entry.reference !== "string" ||
        entry.reference.trim().length === 0
      ) {
        if (result[group] !== "FAIL") result[group] = "UNVERIFIED";
        continue;
      }
      // A reference is an evidence pointer, NOT independently verified proof.
      if (entry.status === "FAIL") result[group] = "FAIL";
      else if (entry.status !== "PASS" && result[group] !== "FAIL")
        result[group] = "UNVERIFIED";
    }
  }
  // Evidence for later gates cannot make earlier gates pass.
  return {
    source: result.source,
    auth: result.auth,
    release: result.release,
    sessionBridge:
      result.auth === "PASS"
        ? "EVIDENCE_REVIEW_REQUIRED"
        : "SESSION_BRIDGE_UNPROVEN",
    publish:
      result.release === "PASS" &&
      result.auth === "PASS" &&
      result.source === "PASS"
        ? "MANUAL_APPROVAL_REQUIRED"
        : "NOT_AUTHORIZED",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const file = process.argv[2];
    if (!file)
      throw Error("usage: node verify-acceptance-evidence.mjs evidence.json");
    const result = classify(JSON.parse(readFileSync(file, "utf8")));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (
      result.source !== "PASS" ||
      result.auth !== "PASS" ||
      result.release !== "PASS"
    )
      process.exitCode = 2;
  } catch (err) {
    process.stderr.write(String(err.message) + "\n");
    process.exitCode = 2;
  }
}
