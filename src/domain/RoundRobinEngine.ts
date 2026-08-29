import type { DomainContext, Entry, Event, Match } from "./types.js";
export function blankMatch(
  event: Event,
  context: DomainContext,
  patch: Partial<Match>,
): Match {
  return {
    id: context.id(),
    event_id: event.id,
    stage: "round_robin",
    group_no: null,
    round_no: 1,
    bracket_position: null,
    entry_a_id: null,
    entry_b_id: null,
    status: "not_started",
    winner_entry_id: null,
    is_bye: false,
    next_match_id: null,
    next_slot: null,
    version: 1,
    scoring_mode: null,
    created_at: context.now(),
    ...patch,
  };
}
export function roundRobin(
  event: Event,
  entries: Entry[],
  context: DomainContext,
  groupNo: number | null = null,
): Match[] {
  if (entries.length < 2) return [];
  const ring: (string | null)[] = entries.map((e) => e.id);
  if (ring.length % 2) ring.push(null);
  const result: Match[] = [];
  for (let round = 1; round < ring.length; round++) {
    for (let j = 0; j < ring.length / 2; j++) {
      const a = ring[j],
        b = ring[ring.length - 1 - j],
        bye = a === null || b === null;
      result.push(
        blankMatch(event, context, {
          stage: groupNo === null ? "round_robin" : "group",
          group_no: groupNo,
          round_no: round,
          bracket_position: j + 1,
          entry_a_id: a,
          entry_b_id: b,
          is_bye: bye,
          status: bye ? "finished" : "not_started",
          winner_entry_id: bye ? a || b : null,
        }),
      );
    }
    ring.splice(1, 0, ring.pop()!);
  }
  return result;
}
