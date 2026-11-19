import { createClient } from "npm:@supabase/supabase-js@2.112.4";

// Trusted mutation boundary. The PostgreSQL function reauthorizes the actor,
// locks the feedback, and atomically writes state, audit and idempotency ledger.
// This Edge route must never accept caller-supplied actor identity or use
// direct table writes. Do not expose private feedback body or submitter ID.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const countCodepoints = (value: string) => Array.from(value).length;

type Resolution = {
  feedbackId: string;
  expectedVersion: number;
  decision: "resolved" | "dismissed";
  reason: string;
  requestId: string;
};
function parseResolution(value: unknown): Resolution | null {
  if (!record(value) || Object.keys(value).length !== 6 ||
      Object.keys(value).some((key) => ![
        "feedback_id", "expected_version", "decision", "reason", "request_id", "confirmed",
      ].includes(key))) return null;
  if (!validId(value.feedback_id) || !validId(value.request_id) ||
      typeof value.expected_version !== "number" || !Number.isSafeInteger(value.expected_version) ||
      value.expected_version < 1 || value.expected_version >= 2147483647 ||
      (value.decision !== "resolved" && value.decision !== "dismissed") ||
      value.confirmed !== true || typeof value.reason !== "string") return null;
  // Match PostgreSQL btrim() semantics: only ordinary ASCII spaces are stripped.
  const reason = value.reason.replace(/^ +| +$/g, "");
  if (countCodepoints(reason) < 10 || countCodepoints(reason) > 1000) return null;
  return {
    feedbackId: value.feedback_id.toLowerCase(), expectedVersion: value.expected_version,
    decision: value.decision, reason, requestId: value.request_id.toLowerCase(),
  };
}

function sanitizeResult(value: unknown, input: Resolution) {
  if (!record(value) || Object.keys(value).length !== 5 ||
      Object.keys(value).some((key) => ![
        "request_id", "feedback_id", "status", "version", "replayed",
      ].includes(key)) ||
      value.request_id !== input.requestId || value.feedback_id !== input.feedbackId ||
      value.status !== input.decision ||
      typeof value.version !== "number" || !Number.isSafeInteger(value.version) ||
      value.version !== input.expectedVersion + 1 ||
      typeof value.replayed !== "boolean") return null;
  return {
    request_id: input.requestId, feedback_id: input.feedbackId,
    status: input.decision, version: value.version, replayed: value.replayed,
  };
}

// Map only known business errors; never echo arbitrary SQL messages to callers.
function rpcFailure(message: string) {
  if (message.includes("PLATFORM_ADMIN_FORBIDDEN")) return json({ code: "PLATFORM_ADMIN_FORBIDDEN" }, 403);
  if (message.includes("FEEDBACK_NOT_FOUND")) return json({ code: "FEEDBACK_NOT_FOUND" }, 404);
  if (message.includes("STALE_FEEDBACK_VERSION") || message.includes("FEEDBACK_ALREADY_FINAL") ||
      message.includes("FEEDBACK_RESOLUTION_REPLAY_STATE_CHANGED") ||
      message.includes("FEEDBACK_RESOLUTION_REPLAY_MISMATCH")) return json({ code: "FEEDBACK_CONFLICT" }, 409);
  if (message.includes("INVALID_FEEDBACK_RESOLUTION_REQUEST") ||
      message.includes("INVALID_FEEDBACK_RESOLUTION_REASON")) return json({ code: "INVALID_FEEDBACK_RESOLUTION" }, 400);
  return json({ code: "FEEDBACK_RESOLUTION_UNAVAILABLE" }, 503);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const token = (req.headers.get("Authorization") || "").match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ code: "AUTH_REQUIRED" }, 401);
  let input: Resolution | null;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json({ code: "INVALID_FEEDBACK_RESOLUTION" }, 413);
    input = parseResolution(JSON.parse(raw));
  } catch {
    return json({ code: "INVALID_FEEDBACK_RESOLUTION" }, 400);
  }
  if (!input) return json({ code: "INVALID_FEEDBACK_RESOLUTION" }, 400);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ code: "SERVICE_UNAVAILABLE" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    const user = authData?.user;
    if (authError) {
      // Auth throttling or outage is not evidence that the caller's JWT expired.
      // Fail closed without invoking the audited feedback mutation RPC.
      const status = authError.status;
      if (status === 400 || status === 401 || status === 403 || status === 422) {
        return json({ code: "AUTH_REQUIRED" }, 401);
      }
      return json({ code: "AUTH_CHECK_UNAVAILABLE" }, 503);
    }
    if (!user || !validId(user.id)) return json({ code: "AUTH_REQUIRED" }, 401);
    const { data, error } = await client.rpc("platform_admin_resolve_feedback", {
      p_actor_auth_user_id: user.id,
      p_feedback_id: input.feedbackId,
      p_expected_version: input.expectedVersion,
      p_decision: input.decision,
      p_reason: input.reason,
      p_request_id: input.requestId,
    });
    if (error) return rpcFailure(String(error.message || ""));
    const result = sanitizeResult(data, input);
    if (!result) return json({ code: "FEEDBACK_RESOLUTION_UNAVAILABLE" }, 503);
    return json(result);
  } catch {
    return json({ code: "FEEDBACK_RESOLUTION_UNAVAILABLE" }, 503);
  }
});
