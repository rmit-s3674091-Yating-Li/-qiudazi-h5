/** Conflict-aware point retry contract shared by organizer and participant scoring. */
export type PointAttemptVersions = { eventVersion: number; matchVersion: number };
export class TournamentCommandError extends Error {
  constructor(message: string, readonly code: string | null, readonly status: number | null) {
    super(message); this.name = "TournamentCommandError";
  }
}
export function pointRetryDisposition(error: unknown, attempted: PointAttemptVersions, observed: PointAttemptVersions | null, committed: boolean): "committed" | "conflict" | "retry" {
  if (committed) return "committed";
  if (!observed || attempted.eventVersion !== observed.eventVersion || attempted.matchVersion !== observed.matchVersion) return "conflict";
  if (error instanceof TournamentCommandError) {
    if (["VERSION_CONFLICT", "POINT_SNAPSHOT_CONFLICT", "OPERATION_CONFLICT"].includes(error.code ?? "")) return "conflict";
    if (error.status === 408 || error.status === 429) return "retry";
    if (error.status !== null && error.status >= 400 && error.status < 500) return "conflict";
  }
  return "retry";
}
