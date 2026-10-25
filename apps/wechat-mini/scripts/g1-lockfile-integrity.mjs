/**
 * Offline, read-only sanity check for the DIRECT npm dependencies in a v3 lock.
 * This is not a full dependency-graph audit; `npm ci` is still required.
 */
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

function sha512Integrity(value) {
  if (typeof value !== "string" || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(value))
    return false;
  const encoded = value.slice("sha512-".length);
  const decoded = Buffer.from(encoded, "base64");
  return decoded.length === 64 && decoded.toString("base64") === encoded;
}

function safeHttpsTarball(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.endsWith(".tgz")
    );
  } catch {
    return false;
  }
}

/**
 * Reject missing/fake direct lock entries before calling a build reproducible.
 * Avoid logging URLs or integrity strings, which may contain private registry data.
 */
export function validateDirectLockIntegrity(manifest, lock) {
  const failures = [];
  if (
    !manifest ||
    !lock ||
    lock.lockfileVersion !== 3 ||
    !lock.packages ||
    typeof lock.packages !== "object"
  )
    return ["LOCK_DIRECT_GRAPH_UNAVAILABLE"];
  const direct = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const [name, version] of Object.entries(direct)) {
    if (!exactVersion.test(version)) {
      failures.push(`LOCK_DIRECT_NOT_EXACT: ${name}`);
      continue;
    }
    const entry = lock.packages[`node_modules/${name}`];
    if (!entry || typeof entry !== "object" || entry.link === true) {
      failures.push(`LOCK_DIRECT_MISSING: ${name}`);
      continue;
    }
    if (entry.version !== version)
      failures.push(`LOCK_DIRECT_VERSION_MISMATCH: ${name}`);
    if (!safeHttpsTarball(entry.resolved))
      failures.push(`LOCK_DIRECT_UNSAFE_RESOLVED: ${name}`);
    if (!sha512Integrity(entry.integrity))
      failures.push(`LOCK_DIRECT_INVALID_INTEGRITY: ${name}`);
  }
  return failures;
}
