import type { Snapshot } from "./types.ts";

export type MatchScoringAction = "point" | "score" | "undo" | "begin";
export type MatchScoringDecision =
  | { allowed: true; actor: "organizer" | "participant" }
  | {
      allowed: false;
      reason:
        | "EVENT_CLOSED"
        | "MATCH_UNAVAILABLE"
        | "NOT_MATCH_PARTICIPANT"
        | "ORGANIZER_ONLY"
        | "RESULT_LOCKED"
        | "SCORING_MODE_CONFLICT";
    };

/**
 * Domain-level eligibility only. It is not an authorization boundary by itself.
 * The Edge Function must resolve actorProfileId from authenticated identity and
 * the database transaction must enforce the same match-scoped rules.
 * A signup_user_id alone does not establish that someone actually plays a match.
 * Missing or inactive entry-player membership fails closed for participants.
 */
export function decideMatchScoringAccess(
  snapshot: Snapshot,
  actorProfileId: string,
  matchId: string,
  action: MatchScoringAction,
): MatchScoringDecision {
  const { event, matches, entries, set_scores: setScores, point_logs: pointLogs } = snapshot;
  if (event.status !== "ongoing") return { allowed: false, reason: "EVENT_CLOSED" };
  const match = matches.find((candidate) => candidate.id === matchId);
  if (!match || match.event_id !== event.id || match.is_bye || !match.entry_a_id || !match.entry_b_id) {
    return { allowed: false, reason: "MATCH_UNAVAILABLE" };
  }

  const organizer = event.owner_user_id === actorProfileId;
  if (organizer) {
    if (action === "begin" && match.status !== "not_started") {
      return { allowed: false, reason: "RESULT_LOCKED" };
    }
    if (action === "point" && (match.status === "finished" || match.scoring_mode === "direct")) {
      return { allowed: false, reason: "SCORING_MODE_CONFLICT" };
    }
    return { allowed: true, actor: "organizer" };
  }

  const participates = entries.some(
    (entry) =>
      entry.event_id === event.id &&
      entry.status === "confirmed" &&
      (entry.id === match.entry_a_id || entry.id === match.entry_b_id) &&
      entry.players.some(
        (player) =>
          player.linked_user_id === actorProfileId &&
          "active" in player &&
          player.active === true,
      ),
  );
  if (!participates) return { allowed: false, reason: "NOT_MATCH_PARTICIPANT" };
  if (action === "begin" || action === "undo") return { allowed: false, reason: "ORGANIZER_ONLY" };
  if (match.status === "finished") return { allowed: false, reason: "RESULT_LOCKED" };
  if (action === "point" && match.scoring_mode === "direct") {
    return { allowed: false, reason: "SCORING_MODE_CONFLICT" };
  }
  if (
    action === "score" &&
    (match.scoring_mode !== null ||
      setScores.some((score) => score.match_id === match.id) ||
      pointLogs.some((point) => point.match_id === match.id && !point.voided_at))
  ) {
    return { allowed: false, reason: "SCORING_MODE_CONFLICT" };
  }
  return { allowed: true, actor: "participant" };
}
