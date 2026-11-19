/** Client retry isolation only. The Edge JWT and atomic RPC remain authoritative. */
export type PointOperationIdentity = Readonly<{
  authUserId: string;
  eventId: string;
  matchId: string;
  side: string;
}>;

/** Preserve the original actor and point payload across weak-network retries. */
export function bindPointOperationIdentity(
  pending: Map<string, PointOperationIdentity>,
  operationId: string,
  identity: PointOperationIdentity,
): boolean {
  const original = pending.get(operationId);
  if (original) {
    return original.authUserId === identity.authUserId &&
      original.eventId === identity.eventId &&
      original.matchId === identity.matchId &&
      original.side === identity.side;
  }
  pending.set(operationId, identity);
  return true;
}
