/** Presentation-only reconciliation: a polling snapshot can contain a point
 * before its request finishes. Never render or predict that point twice.
 * The in-flight queue remains intact until the trusted response/replay settles.
 */
type PointLogIdentity = { id: string; match_id: string; winner_side: string; voided_at?: string | null };

/** Only an explicit null voided_at proves the point is active. Missing status is unverified. */
export function isActiveCommittedPoint(
  log: PointLogIdentity,
  operationId: string,
  matchId: string,
  side: string,
): boolean {
  return log.id === operationId && log.match_id === matchId &&
    log.winner_side === side && log.voided_at === null;
}

export function uncommittedPointQueue<T extends { operationId: string; side: string }>(
  pending: readonly T[],
  pointLogs: readonly PointLogIdentity[],
  matchId: string,
): T[] {
  // An operation ID on another side or a voided point is not proof that
  // this pending point remains committed. Match active point identity.
  const committedSides = new Map(
    pointLogs.filter((log) => log.match_id === matchId && log.voided_at === null)
      .map((log) => [log.id, log.winner_side]),
  );
  return pending.filter((point) => committedSides.get(point.operationId) !== point.side);
}
