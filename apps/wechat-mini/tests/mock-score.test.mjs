import test from "node:test";
import assert from "node:assert/strict";
import { initialScore } from "../src/shared-domain/ScoringEngine.ts";
import { advanceMockScore } from "../src/core/mock-score.ts";

const rules = {
  best_of: 1,
  scoring_type: "points_11",
  custom_games_target: null,
  tiebreak_trigger: null,
  game_scoring: "advantage",
};

test("11 consecutive A points end the offline mock match", () => {
  let state = initialScore();
  for (let n = 0; n < 11; n++) state = advanceMockScore(rules, state, "A");
  assert.equal(state.winner, "A");
  assert.equal(state.pointCount, 11);
});

test("extra queued taps after winner are no-ops, not MATCH_FINISHED exceptions", () => {
  // Simulate multiple React functional updates queued from one render.
  const queued = Array.from(
    { length: 15 },
    () => (previous) => advanceMockScore(rules, previous, "A"),
  );
  const state = queued.reduce(
    (previous, apply) => apply(previous),
    initialScore(),
  );
  assert.equal(state.winner, "A");
  assert.equal(state.pointCount, 11);
  assert.equal(advanceMockScore(rules, state, "B"), state);
});

test("side B and deuce-style extra points preserve canonical scoring rules", () => {
  let state = initialScore();
  for (let n = 0; n < 10; n++) {
    state = advanceMockScore(rules, state, "A");
    state = advanceMockScore(rules, state, "B");
  }
  assert.equal(state.winner, null);
  state = advanceMockScore(rules, state, "B");
  assert.equal(state.winner, null);
  state = advanceMockScore(rules, state, "B");
  assert.equal(state.winner, "B");
  assert.equal(state.pointCount, 22);
});
