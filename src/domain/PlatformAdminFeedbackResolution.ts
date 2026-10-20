/** Client contract only. The Edge endpoint validates JWT and the DB RPC reauthorizes in its transaction. */
export type FeedbackResolutionDecision = "resolved" | "dismissed";
export type FeedbackResolutionAttempt = {
  feedback_id: string;
  expected_version: number;
  decision: FeedbackResolutionDecision;
  reason: string;
  request_id: string;
  confirmed: true;
};
export type FeedbackResolutionReceipt = {
  feedback_id: string;
  request_id: string;
  status: FeedbackResolutionDecision;
  version: number;
  replayed: boolean;
};
export type FeedbackResolutionOutcome =
  | { kind: "committed"; receipt: FeedbackResolutionReceipt }
  | { kind: "conflict" | "forbidden" | "not_found" | "invalid" | "uncertain" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const validId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);

/** The UUID is allocated once and must be reused for every uncertain-response retry. */
export function makeFeedbackResolutionAttempt(input: {
  feedbackId: string;
  version: number;
  decision: FeedbackResolutionDecision;
  reason: string;
  requestId: string;
}): FeedbackResolutionAttempt | null {
  if (!validId(input.feedbackId) || !validId(input.requestId) ||
      !Number.isSafeInteger(input.version) || input.version < 1 || input.version >= 2147483647 ||
      (input.decision !== "resolved" && input.decision !== "dismissed") ||
      typeof input.reason !== "string") return null;
  const reason = input.reason.replace(/^ +| +$/g, "");
  if (Array.from(reason).length < 10 || Array.from(reason).length > 1000) return null;
  return {
    feedback_id: input.feedbackId.toLowerCase(), expected_version: input.version,
    decision: input.decision, reason, request_id: input.requestId.toLowerCase(), confirmed: true,
  };
}

/** Never accept extra server keys: feedback messages and submitter identities are private. */
export function parseFeedbackResolutionReceipt(value: unknown, attempt: FeedbackResolutionAttempt): FeedbackResolutionReceipt | null {
  if (!record(value) || !exact(value, ["feedback_id", "request_id", "status", "version", "replayed"]) ||
      value.feedback_id !== attempt.feedback_id || value.request_id !== attempt.request_id ||
      value.status !== attempt.decision || value.version !== attempt.expected_version + 1 ||
      typeof value.replayed !== "boolean") return null;
  return value as FeedbackResolutionReceipt;
}

type EdgeResult = { data: unknown; error: unknown };
export type FeedbackResolutionInvoke = (name: string, options: { body: FeedbackResolutionAttempt }) => Promise<EdgeResult>;

function statusFromError(error: unknown): number | null {
  if (!record(error) || !record(error.context)) return null;
  const status = error.context.status;
  return typeof status === "number" && Number.isInteger(status) ? status : null;
}

/** Supabase FunctionsHttpError exposes the trusted Edge code in Response JSON.
 * Read a clone only: parsing must never consume the original response. */
async function edgeFailureCode(error: unknown): Promise<string | null> {
  if (!record(error) || !record(error.context)) return null;
  try {
    const context = error.context;
    if (typeof context.clone !== "function") return null;
    const response: unknown = context.clone();
    if (!record(response) || typeof response.json !== "function") return null;
    const body: unknown = await response.json();
    return record(body) && typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}

/** An unknown transport/5xx failure may occur after commit: retain the SAME request_id. */
export async function submitFeedbackResolution(
  invoke: FeedbackResolutionInvoke,
  attempt: FeedbackResolutionAttempt,
): Promise<FeedbackResolutionOutcome> {
  try {
    const { data, error } = await invoke("platform-admin-feedback-resolution", { body: attempt });
    if (error) {
      const status = statusFromError(error);
      const code = await edgeFailureCode(error);
      if (code === "AUTH_REQUIRED" || code === "PLATFORM_ADMIN_FORBIDDEN" ||
          status === 401 || status === 403) return { kind: "forbidden" };
      if (code === "FEEDBACK_NOT_FOUND" || status === 404) return { kind: "not_found" };
      if (code === "FEEDBACK_CONFLICT" || status === 409) return { kind: "conflict" };
      if (code === "INVALID_FEEDBACK_RESOLUTION" || code === "METHOD_NOT_ALLOWED" ||
          (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429)) {
        return { kind: "invalid" };
      }
      return { kind: "uncertain" };
    }
    const receipt = parseFeedbackResolutionReceipt(data, attempt);
    return receipt ? { kind: "committed", receipt } : { kind: "uncertain" };
  } catch {
    return { kind: "uncertain" };
  }
}
