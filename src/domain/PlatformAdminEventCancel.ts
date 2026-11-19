/** Browser preflight only; trusted Edge and the locked SQL transaction reauthorize. */
export type CancelableAdminEvent = {
  id: string;
  name: string;
  status: "signup" | "locked" | "ongoing" | "finished" | "cancelled";
  version: number;
};
export type AdminCancelRequest = {
  event_id: string;
  expected_version: number;
  request_id: string;
  reason: string;
  confirmed: true;
};
export type AdminCancelResponse = {
  id: string;
  status: "cancelled";
  version: number;
  cancelled_at: string;
  replayed: boolean;
};
export type AdminCancelPreflight =
  | { ok: true; command: AdminCancelRequest }
  | { ok: false; reason: "ROLE_FORBIDDEN" | "EVENT_UNAVAILABLE" | "REASON_INVALID" | "CONFIRM_REQUIRED" | "REQUEST_INVALID" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Require typed event name and an explicit checkbox before this high-risk command. */
export function prepareAdminCancelRequest(input: {
  role: string | null;
  event: CancelableAdminEvent;
  reason: string;
  typedName: string;
  acknowledged: boolean;
  requestId: string;
}): AdminCancelPreflight {
  if (input.role !== "super_admin") return { ok: false, reason: "ROLE_FORBIDDEN" };
  const event = input.event;
  if (!uuid.test(event.id) || !Number.isSafeInteger(event.version) || event.version < 1 || event.version >= 2147483647 ||
      (event.status !== "signup" && event.status !== "locked") ||
      !event.name || event.name.length > 80) return { ok: false, reason: "EVENT_UNAVAILABLE" };
  const reason = input.reason.replace(/^ +| +$/g, "");
  if (Array.from(reason).length < 10 || Array.from(reason).length > 1000) {
    return { ok: false, reason: "REASON_INVALID" };
  }
  if (input.typedName !== event.name || !input.acknowledged) {
    return { ok: false, reason: "CONFIRM_REQUIRED" };
  }
  if (!uuid.test(input.requestId)) return { ok: false, reason: "REQUEST_INVALID" };
  return { ok: true, command: {
    event_id: event.id, expected_version: event.version, request_id: input.requestId,
    reason, confirmed: true,
  } };
}

/** Reject unexpected fields rather than silently accepting a changed Edge contract. */
export function parseAdminCancelResponse(value: unknown, request: AdminCancelRequest): AdminCancelResponse | null {
  if (!record(value) || Object.keys(value).length !== 5 ||
      Object.keys(value).some((key) => !["id", "status", "version", "cancelled_at", "replayed"].includes(key)) ||
      value.id !== request.event_id || value.status !== "cancelled" ||
      !Number.isSafeInteger(value.version) || value.version !== request.expected_version + 1 ||
      typeof value.cancelled_at !== "string" || !timestamp.test(value.cancelled_at) ||
      !Number.isFinite(Date.parse(value.cancelled_at)) || typeof value.replayed !== "boolean") return null;
  return value as AdminCancelResponse;
}

/** A known rejection stays terminal even if the transport loses its HTTP status. */
const terminalCancelCodes = new Set([
  "AUTH_REQUIRED", "PLATFORM_ADMIN_FORBIDDEN", "EVENT_NOT_FOUND",
  "VERSION_CONFLICT", "ADMIN_REQUEST_CONFLICT", "EVENT_CANCEL_STATE_CONFLICT",
  "EVENT_ALREADY_STARTED", "INVALID_CANCEL_REQUEST", "INVALID_CANCEL_REASON",
  "METHOD_NOT_ALLOWED",
]);

/** Only transport/server-unavailable errors may be manually retried with the SAME request_id. */
export function adminCancelFailure(status: number | null, code: string | null): "retry_same_request" | "refresh_required" {
  if (code && terminalCancelCodes.has(code)) return "refresh_required";
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return "refresh_required";
  }
  if (status === null || status >= 500 || status === 408 || status === 429 ||
      code === "SERVICE_UNAVAILABLE" || code === "ADMIN_CANCEL_UNAVAILABLE") {
    return "retry_same_request";
  }
  return "refresh_required";
}
