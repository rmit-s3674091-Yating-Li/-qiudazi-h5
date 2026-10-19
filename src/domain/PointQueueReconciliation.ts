/** Presentation-only reconciliation: a polling snapshot can contain a point
 * before its request finishes. Never render or predict that point twice.
 * The in-flight queue remains intact until the trusted response/replay settles.
 */
export function uncommittedPointQueue<T extends { operationId: string; side: string }>(
  pending: readonly T[],
  pointLogs: readonly { id: string; match_id: string; winner_side: string }[],
  matchId: string,
): T[] {
  // An operation ID on another side is a replay conflict, not proof that
  // this pending point was committed. Match the full point identity.
  const committedSides = new Map(
    pointLogs.filter((log) => log.match_id === matchId).map((log) => [log.id, log.winner_side]),
  );
  return pending.filter((point) => committedSides.get(point.operationId) !== point.side);
}
