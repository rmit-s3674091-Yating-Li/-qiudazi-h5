export type QuickEventStatus = "signup" | "locked" | "ongoing" | "finished" | "cancelled";
export type QuickViewerRole = "owner" | "participant" | "viewer";
export type QuickLifecycleAction = "cancel" | "withdraw" | "retire" | "walkover" | "none";

export function minimumQuickEntries(matchType: "singles" | "doubles") {
  return matchType === "doubles" ? 2 : 2;
}

export function quickLifecycleAction(input: {
  status: QuickEventStatus;
  viewerRole: QuickViewerRole;
  hasStartedMatch: boolean;
}): QuickLifecycleAction {
  const { status, viewerRole, hasStartedMatch } = input;
  if (status === "cancelled" || status === "finished") return "none";
  const preStart = !hasStartedMatch && (status === "signup" || status === "locked");
  if (preStart && viewerRole === "owner") return "cancel";
  if (preStart && viewerRole === "participant") return "withdraw";
  if (status === "ongoing" || hasStartedMatch) {
    return viewerRole === "participant" || viewerRole === "owner" ? "retire" : "none";
  }
  return "none";
}

export function quickWithdrawalOutcome(input: {
  matchType: "singles" | "doubles";
  confirmedEntriesAfterWithdrawal: number;
}) {
  const minimum = minimumQuickEntries(input.matchType);
  return input.confirmedEntriesAfterWithdrawal < minimum ? "cancel_event" as const : "keep_event" as const;
}

export function canUseOrdinaryQuickWithdrawal(status: QuickEventStatus, hasStartedMatch: boolean) {
  return !hasStartedMatch && (status === "signup" || status === "locked");
}
