/** Client-side presentation gate only. The trusted Edge and atomic RPC authorize writes. */
export type ParticipantEligibilityStatus = "eligible" | "ineligible" | "unavailable";
export type ParticipantEligibilityResult = {
  key: string;
  status: ParticipantEligibilityStatus;
};

export function participantEligibilityKey(input: {
  eventId: string;
  matchId: string;
  eventVersion: number;
  matchVersion: number;
  authRevision: number;
  retryRevision: number;
}): string {
  return JSON.stringify([
    input.eventId,
    input.matchId,
    input.eventVersion,
    input.matchVersion,
    input.authRevision,
    input.retryRevision,
  ]);
}

/** Reject malformed or unexpectedly expanded Edge responses; never assume eligibility. */
export function parseParticipantEligibility(value: unknown): boolean | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || typeof record.eligible !== "boolean") return null;
  return record.eligible;
}

/** A positive response is usable only for the exact identity/versions that requested it. */
export function hasCurrentParticipantEligibility(
  currentKey: string,
  result: ParticipantEligibilityResult | null,
): boolean {
  return result?.key === currentKey && result.status === "eligible";
}
