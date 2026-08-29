import type { Snapshot, Ranking, Entry, Match } from "./types.js";
import { isPointSet } from "./ScoringEngine.js";
export function ranking(s: Snapshot, groupNo: number | null = null): Ranking[] {
  const entries = s.entries.filter(
    (e) =>
      e.status === "confirmed" && (groupNo === null || e.group_no === groupNo),
  );
  const matches = s.matches.filter(
    (m) =>
      !m.is_bye &&
      m.status === "finished" &&
      m.stage !== "knockout" &&
      (groupNo === null || m.group_no === groupNo),
  );
  const rows = entries.map((e) => {
    const played = matches.filter(
      (m) => m.entry_a_id === e.id || m.entry_b_id === e.id,
    );
    let won = 0,
      lost = 0;
    for (const m of played)
      for (const set of s.set_scores.filter((x) => x.match_id === m.id)) {
        if (!isPointSet(s.event)) {
          won +=
            m.entry_a_id === e.id
              ? set.a_games_or_points
              : set.b_games_or_points;
          lost +=
            m.entry_a_id === e.id
              ? set.b_games_or_points
              : set.a_games_or_points;
        }
      }
    const wins = played.filter((m) => m.winner_entry_id === e.id).length;
    return {
      entry_id: e.id,
      rank: 0,
      played: played.length,
      wins,
      losses: played.length - wins,
      games_won: won,
      games_lost: lost,
      game_difference: won - lost,
      joined_at: e.joined_at,
    };
  });
  const tied = new Map<number, Ranking[]>();
  for (const row of rows)
    tied.set(row.wins, [...(tied.get(row.wins) || []), row]);
  return [...tied.entries()]
    .sort(([a], [b]) => b - a)
    .flatMap(([, bucket]) =>
      bucket.sort((a, b) => {
        if (bucket.length === 2) {
          const head = matches.find(
            (m) =>
              [m.entry_a_id, m.entry_b_id].includes(a.entry_id) &&
              [m.entry_a_id, m.entry_b_id].includes(b.entry_id),
          );
          if (head?.winner_entry_id)
            return head.winner_entry_id === a.entry_id ? -1 : 1;
        }
        return (
          b.game_difference - a.game_difference ||
          b.games_won - a.games_won ||
          a.joined_at.localeCompare(b.joined_at) ||
          a.entry_id.localeCompare(b.entry_id)
        );
      }),
    )
    .map((row, i) => ({ ...row, rank: i + 1 }));
}
export function groupRankings(s: Snapshot) {
  return Array.from({ length: s.event.group_count! }, (_, i) =>
    ranking(s, i + 1),
  );
}
export function podium(s: Snapshot): { label: string; entries: Entry[] }[] {
  const find = (ids: (string | null | undefined)[]) =>
    s.entries.filter((e) => ids.includes(e.id));
  if (s.event.format === "round_robin")
    return ranking(s)
      .slice(0, 3)
      .map((r, i) => ({
        label: ["冠军", "亚军", "季军"][i],
        entries: find([r.entry_id]),
      }));
  const ko = s.matches.filter((m) => m.stage === "knockout");
  const final = ko.find((m) => !m.next_match_id);
  if (!final || final.status !== "finished" || !final.winner_entry_id)
    return [];
  const loser = (m: Match) =>
    m.entry_a_id === m.winner_entry_id ? m.entry_b_id : m.entry_a_id;
  return [
    { label: "冠军", entries: find([final.winner_entry_id]) },
    { label: "亚军", entries: find([loser(final)]) },
    {
      label: "并列季军",
      entries: find(
        ko
          .filter(
            (m) =>
              m.next_match_id === final.id &&
              m.status === "finished" &&
              !m.is_bye,
          )
          .map(loser),
      ),
    },
  ].filter((x) => x.entries.length);
}
