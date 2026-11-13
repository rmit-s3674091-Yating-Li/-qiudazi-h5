import { addPoint, type LiveState } from "../shared-domain/ScoringEngine.ts";
import type { Rules, Side } from "../shared-domain/types.ts";

/**
 * UI-only offline score reducer. Check the *current* state inside the React
 * functional updater: queued taps may all see the same stale render closure.
 * This does not authorize or persist a real participant score operation.
 */
export function advanceMockScore(
  rules: Rules,
  previous: LiveState,
  side: Side,
): LiveState {
  if (previous.winner !== null) return previous;
  return addPoint(rules, previous, side);
}
