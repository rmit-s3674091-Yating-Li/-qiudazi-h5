import type { Match, Snapshot } from "./types.ts";
import { ensure } from "./types.ts";
export function downstream(matches: Match[], source: Match): Match[] {
  const path: Match[] = [];
  let next = source.next_match_id;
  const visited = new Set([source.id]);
  while (next) {
    ensure(!visited.has(next), "BRACKET_CYCLE", "签表结构异常");
    visited.add(next);
    const m = matches.find((x) => x.id === next);
    ensure(m, "BRACKET_MISSING", "下游比赛不存在");
    path.push(m);
    next = m.next_match_id;
  }
  return path;
}
export function correctKnockoutPath(
  s: Snapshot,
  before: Match,
  after: Match,
  confirmed: boolean,
): string[] {
  if (before.winner_entry_id === after.winner_entry_id) return [];
  const path = downstream(s.matches, after);
  ensure(
    !path.some((m) => m.status !== "not_started"),
    "DOWNSTREAM_STARTED",
    "下游比赛已经开始或结束，不能改变上游胜者",
  );
  if (before.winner_entry_id && path.length)
    ensure(
      confirmed,
      "CONFIRM_CASCADE",
      "更正将清除受影响的未开始下游对阵，并按新胜者重建。请确认级联影响。",
    );
  let source = after;
  for (const m of path) {
    if (source.next_slot === "A") m.entry_a_id = source.winner_entry_id;
    else m.entry_b_id = source.winner_entry_id;
    m.winner_entry_id = null;
    m.status = "not_started";
    m.scoring_mode = null;
    m.version++;
    source = m;
  }
  return path.map((m) => m.id);
}
