import type { DomainContext, Entry, Event, Match, Ranking } from "./types.js";
import { roundRobin } from "./RoundRobinEngine.js";
import { bracketSize, seedPositions, knockout } from "./KnockoutEngine.js";
export function snakeGroups(entries: Entry[], count: number): Entry[][] {
  const groups: Entry[][] = Array.from({ length: count }, () => []);
  entries.forEach((en, i) => {
    const block = Math.floor(i / count),
      offset = i % count;
    groups[block % 2 ? count - 1 - offset : offset].push(en);
  });
  return groups;
}
export function groupDraw(
  event: Event,
  entries: Entry[],
  context: DomainContext,
): { entries: Entry[]; matches: Match[] } {
  const groups = snakeGroups(entries, event.group_count!);
  return {
    entries: groups.flatMap((g, i) =>
      g.map((en) => ({ ...en, group_no: i + 1 })),
    ),
    matches: groups.flatMap((g, i) => roundRobin(event, g, context, i + 1)),
  };
}
export function qualificationSeeds(
  event: Event,
  groups: Ranking[][],
  entries: Entry[],
): Entry[] {
  const seeds: { entry: Entry; tier: number }[] = [];
  for (let rank = 0; rank < event.qualifiers_per_group!; rank++) {
    const tier = groups
      .map((g) => g[rank])
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          b.game_difference - a.game_difference ||
          b.games_won - a.games_won ||
          a.joined_at.localeCompare(b.joined_at) ||
          a.entry_id.localeCompare(b.entry_id),
      );
    for (const r of tier) {
      const entry = entries.find((e) => e.id === r.entry_id);
      if (entry) seeds.push({ entry, tier: rank });
    }
  }
  const positions = seedPositions(bracketSize(seeds.length));
  const conflicts = () => {
    let n = 0;
    for (let i = 0; i < positions.length; i += 2) {
      const a = seeds[positions[i] - 1]?.entry,
        b = seeds[positions[i + 1] - 1]?.entry;
      if (a && b && a.group_no === b.group_no) n++;
    }
    return n;
  };
  // Preserve rank tiers. Only exchange seeds in the same tier when it reduces rematches.
  let improved = true;
  while (improved) {
    improved = false;
    let score = conflicts();
    for (let i = 0; i < seeds.length; i++)
      for (let j = i + 1; j < seeds.length; j++) {
        if (seeds[i].tier !== seeds[j].tier) continue;
        [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
        const next = conflicts();
        if (next < score) {
          score = next;
          improved = true;
        } else [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
      }
  }
  return seeds.map((x) => x.entry);
}
export function qualifierKnockout(
  event: Event,
  groups: Ranking[][],
  entries: Entry[],
  context: DomainContext,
) {
  return knockout(event, qualificationSeeds(event, groups, entries), context);
}
