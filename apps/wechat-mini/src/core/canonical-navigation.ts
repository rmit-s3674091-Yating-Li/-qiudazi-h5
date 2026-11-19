import {
  decodeMiniPath,
  encodeMiniPath,
  type NavigationIntent,
} from "./navigation.ts";

/** Strict, syntax-only inbound boundary. Never grants invite, score or media access. */
export function decodeCanonicalMiniPath(
  path: unknown,
): NavigationIntent | null {
  if (typeof path !== "string" || path.length > 512) return null;
  const intent = decodeMiniPath(path);
  if (!intent) return null;
  try {
    // One wire representation per semantic intent: rejects reordered keys,
    // percent-encoding aliases, redundant delimiters and alternate spellings.
    return encodeMiniPath(intent) === path ? intent : null;
  } catch {
    return null;
  }
}
