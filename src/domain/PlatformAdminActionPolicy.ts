/**
 * Client-side preflight for V8 Platform Admin actions.
 * This is NOT an authorization boundary: each future server mutation must
 * recheck the authenticated actor, apply the business change and write audit
 * within one transaction. Keep this mapping aligned with the audit migration.
 */
export const PLATFORM_ADMIN_ACTIONS = {
  USER_RESTRICT: { targetKind: "user", risk: "high" },
  EVENT_CANCEL: { targetKind: "event", risk: "high" },
  SCORE_CORRECT: { targetKind: "match", risk: "high" },
  PHOTO_REMOVE: { targetKind: "photo", risk: "high" },
  VENUE_UPDATE: { targetKind: "venue", risk: "high" },
  COMMERCIAL_ORGANIZATION_VERIFY: { targetKind: "commercial_organization", risk: "high" },
  REPORT_RESOLVE: { targetKind: "report", risk: "low" },
  FEEDBACK_RESOLVE: { targetKind: "feedback", risk: "low" },
  ADMIN_MEMBER_CHANGE: { targetKind: "admin_member", risk: "high" },
} as const;

export type PlatformAdminAction = keyof typeof PLATFORM_ADMIN_ACTIONS;
export type PlatformAdminRole = "reviewer" | "operator" | "super_admin";
export type PlatformAdminActionDecision =
  | {
      allowed: true;
      risk: "low" | "high";
      action: PlatformAdminAction;
      targetKind: string;
      targetId: string;
      reason: string;
    }
  | {
      allowed: false;
      reason:
        | "UNKNOWN_ACTION"
        | "TARGET_MISMATCH"
        | "ROLE_FORBIDDEN"
        | "TARGET_ID_INVALID"
        | "REASON_INVALID";
    };

export function evaluatePlatformAdminAction(input: {
  role: PlatformAdminRole | null;
  action: string;
  targetKind: string;
  targetId: string;
  reason: string;
}): PlatformAdminActionDecision {
  if (!Object.prototype.hasOwnProperty.call(PLATFORM_ADMIN_ACTIONS, input.action)) {
    return { allowed: false, reason: "UNKNOWN_ACTION" };
  }
  const action = input.action as PlatformAdminAction;
  const spec = PLATFORM_ADMIN_ACTIONS[action];
  if (input.targetKind !== spec.targetKind) {
    return { allowed: false, reason: "TARGET_MISMATCH" };
  }
  if (
    (spec.risk === "high" && input.role !== "super_admin") ||
    (spec.risk === "low" && input.role !== "operator" && input.role !== "super_admin")
  ) {
    return { allowed: false, reason: "ROLE_FORBIDDEN" };
  }
  // PostgreSQL btrim(text) strips ordinary spaces, not all Unicode whitespace.
  // Count Unicode code points to match PostgreSQL length(text) for emoji as well.
  const targetId = typeof input.targetId === "string" ? input.targetId.replace(/^ +| +$/g, "") : "";
  if (Array.from(targetId).length < 1 || Array.from(targetId).length > 128) {
    return { allowed: false, reason: "TARGET_ID_INVALID" };
  }
  const reason = typeof input.reason === "string" ? input.reason.replace(/^ +| +$/g, "") : "";
  if (Array.from(reason).length < 10 || Array.from(reason).length > 1000) {
    return { allowed: false, reason: "REASON_INVALID" };
  }
  return { allowed: true, risk: spec.risk, action, targetKind: spec.targetKind, targetId, reason };
}
