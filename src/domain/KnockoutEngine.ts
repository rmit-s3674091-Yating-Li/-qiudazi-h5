import type { DomainContext, Entry, Event, Match } from "./types.ts";
import { blankMatch } from "./RoundRobinEngine.ts";
export function bracketSize(count: number) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, count)));
}
export function seedPositions(size: number): number[] {
  let seeds = [1, 2];
  for (let n = 4; n <= size; n *= 2)
    seeds = seeds.flatMap((x) => [x, n + 1 - x]);
  return seeds;
}
export function advanceWinner(matches: Match[], source: Match) {
  if (!source.next_match_id) return;
  const next = matches.find((m) => m.id === source.next_match_id);
  if (!next) throw new Error("Missing downstream match");
  if (source.next_slot === "A") next.entry_a_id = source.winner_entry_id;
  else next.entry_b_id = source.winner_entry_id;
}
export function knockout(
  event: Event,
  seeds: Entry[],
  context: DomainContext,
): Match[] {
  if (seeds.length < 2) return [];
  const size = bracketSize(seeds.length),
    positions = seedPositions(size),
    result: Match[] = [];
  const rounds: Match[][] = [];
  for (let count = size / 2, round = 1; count >= 1; count /= 2, round++) {
    const ms = Array.from({ length: count }, (_, i) =>
      blankMatch(event, context, {
        stage: "knockout",
        round_no: round,
        bracket_position: i + 1,
      }),
    );
    rounds.push(ms);
    result.push(...ms);
  }
  for (let r = 0; r < rounds.length; r++)
    rounds[r].forEach((m, i) => {
      if (r < rounds.length - 1) {
        m.next_match_id = rounds[r + 1][Math.floor(i / 2)].id;
        m.next_slot = i % 2 ? "B" : "A";
      }
      if (r === 0) {
        m.entry_a_id = seeds[positions[2 * i] - 1]?.id || null;
        m.entry_b_id = seeds[positions[2 * i + 1] - 1]?.id || null;
        if (!m.entry_a_id || !m.entry_b_id) {
          m.is_bye = true;
          m.status = "finished";
          m.winner_entry_id = m.entry_a_id || m.entry_b_id;
        }
      }
    });
  rounds[0].filter((m) => m.is_bye).forEach((m) => advanceWinner(result, m));
  return result;
}
