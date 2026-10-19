/** Presentation-only reconciliation: a polling snapshot can contain a point
 * before its request finishes. Never render or predict that point twice.
 * The in-flight queue remains intact until the trusted response/replay settles.
 */
export function uncommittedPointQueue<T extends { operationId: string }>(
  pending: readonly T[],
  pointLogs: readonly { id: string; match_id: string }[],
  matchId: string,
): T[] {
  const committedIds = new Set(
    pointLogs.filter((log) => log.match_id === matchId).map((log) => log.id),
  );
  return pending.filter((point) => !committedIds.has(point.operationId));
}
