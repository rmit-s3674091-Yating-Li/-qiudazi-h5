/** Conflict-aware point retry contract shared by organizer and participant scoring. */
export type PointAttemptVersions = { eventVersion: number; matchVersion: number };

export class TournamentCommandError extends Error {
  constructor(message: string, readonly code: string | null, readonly status: number | null) {
    super(message);
    this.name = "TournamentCommandError";
  }
}

/** Explicit Edge/authorization rejections remain terminal even if transport status is missing. */
const terminalPointCodes = new Set([
  "VERSION_CONFLICT", "POINT_SNAPSHOT_CONFLICT", "OPERATION_CONFLICT",
  "POINT_RETRY_IDENTITY_CONFLICT", "NOT_MATCH_PARTICIPANT",
  "PARTICIPANT_POINT_NOT_ALLOWED", "FORBIDDEN", "AUTH_REQUIRED",
  "PROFILE_REQUIRED", "EVENT_NOT_FOUND", "MATCH_NOT_FOUND",
  "INVALID_POINT_COMMAND", "DIRECT_SCORE_MODE", "MATCH_FINISHED",
  "SCORING_STATE",
  // Edge/RPC can reject a point for terminal event, match or membership state.
  // Preserve those denials even if a proxy drops the HTTP status.
  "EVENT_FINISHED", "EVENT_CANCELLED", "MATCH_NOT_READY",
  "MATCH_ALREADY_FINISHED", "NOT_PARTICIPANT", "DOWNSTREAM_MATCH_STARTED",
]);

/** Never silently rebase a point onto a changed score or retry a rejected request. */
export function pointRetryDisposition(
  error: unknown,
  attempted: PointAttemptVersions,
  observed: PointAttemptVersions | null,
  committed: boolean,
): "committed" | "conflict" | "retry" {
  // A matching log proves that an operation_id exists, not that this actor
  // was authorized to replay it. Explicit server denials take precedence.
  if (error instanceof TournamentCommandError) {
    if (error.code && terminalPointCodes.has(error.code)) return "conflict";
    if (error.status !== null && error.status >= 400 && error.status < 500 &&
        error.status !== 408 && error.status !== 429) return "conflict";
  }
  if (committed) return "committed";
  if (!observed || attempted.eventVersion !== observed.eventVersion || attempted.matchVersion !== observed.matchVersion) {
    return "conflict";
  }
  // A timeout or rate limit does not prove the point was rejected. Preserve
  // operation_id for one safe replay; version drift is already checked above.
  return "retry";
}
