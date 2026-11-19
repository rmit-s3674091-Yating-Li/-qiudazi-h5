/** A nickname-login response may adopt only its own actor, never a superseded account. */
export function isCurrentNicknameLoginResponse(
  attempt: number,
  latestAttempt: number,
  startedGeneration: number,
  currentGeneration: number,
  currentUserId: string | null,
  verifiedUserId?: string,
): boolean {
  if (attempt !== latestAttempt) return false;
  if (verifiedUserId === undefined) return currentGeneration === startedGeneration;
  // verifyOtp can emit SIGNED_IN before its Promise resolves; that single actor
  // transition is expected. A second transition (A -> B -> A) is not.
  return currentGeneration === startedGeneration ||
    (currentGeneration === startedGeneration + 1 && currentUserId === verifiedUserId);
}
