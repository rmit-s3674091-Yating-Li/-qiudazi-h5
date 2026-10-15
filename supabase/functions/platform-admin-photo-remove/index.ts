import { createClient } from "npm:@supabase/supabase-js@2.112.4";

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
const validId = (value: unknown): value is string =>
  typeof value === "string" && uuid.test(value);

type RemoveRequest = {
  eventId: string;
  photoId: string;
  expectedVersion: number;
  requestId: string;
  reason: string;
};

function parseRequest(value: unknown): RemoveRequest | null {
  const fields = ["event_id", "photo_id", "expected_version", "request_id", "reason", "confirmed"];
  if (!record(value) || Object.keys(value).length !== fields.length ||
      Object.keys(value).some((key) => !fields.includes(key)) ||
      !validId(value.event_id) || !validId(value.photo_id) || !validId(value.request_id) ||
      typeof value.expected_version !== "number" || !Number.isSafeInteger(value.expected_version) ||
      value.expected_version < 1 || value.expected_version >= 2147483647 ||
      value.confirmed !== true || typeof value.reason !== "string") return null;
  const reason = value.reason.replace(/^ +| +$/g, "");
  if (Array.from(reason).length < 10 || Array.from(reason).length > 1000) return null;
  return {
    eventId: value.event_id.toLowerCase(),
    photoId: value.photo_id.toLowerCase(),
    expectedVersion: value.expected_version,
    requestId: value.request_id.toLowerCase(),
    reason,
  };
}

function sanitizeResult(value: unknown, command: RemoveRequest) {
  if (!record(value) || Object.keys(value).length !== 4 ||
      Object.keys(value).some((key) => ![
        "photo_id", "event_id", "cleanup_pending", "replayed",
      ].includes(key)) ||
      value.photo_id !== command.photoId || value.event_id !== command.eventId ||
      typeof value.cleanup_pending !== "boolean" || typeof value.replayed !== "boolean") return null;
  return {
    photo_id: command.photoId,
    event_id: command.eventId,
    cleanup_pending: value.cleanup_pending,
    replayed: value.replayed,
  };
}

function rpcFailure(message: string) {
  if (message.includes("PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN")) return json({ code: "PLATFORM_ADMIN_FORBIDDEN" }, 403);
  if (message.includes("EVENT_NOT_FOUND") || message.includes("PHOTO_NOT_FOUND")) return json({ code: "PHOTO_NOT_FOUND" }, 404);
  if (message.includes("VERSION_CONFLICT") || message.includes("ADMIN_REQUEST_CONFLICT")) return json({ code: "PHOTO_REMOVE_CONFLICT" }, 409);
  if (message.includes("INVALID_PHOTO_REMOVAL_REQUEST") || message.includes("INVALID_ADMIN_REASON") || message.includes("PHOTO_STORAGE_PATH_INVALID")) {
    return json({ code: "INVALID_PHOTO_REMOVAL" }, 400);
  }
  return json({ code: "PHOTO_REMOVAL_UNAVAILABLE" }, 503);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const token = req.headers.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ code: "AUTH_REQUIRED" }, 401);

  let command: RemoveRequest | null;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json({ code: "INVALID_PHOTO_REMOVAL" }, 413);
    command = parseRequest(JSON.parse(raw));
  } catch {
    return json({ code: "INVALID_PHOTO_REMOVAL" }, 400);
  }
  if (!command) return json({ code: "INVALID_PHOTO_REMOVAL" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ code: "SERVICE_UNAVAILABLE" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user || !validId(user.id)) return json({ code: "AUTH_REQUIRED" }, 401);
    const { data, error } = await client.rpc("platform_admin_remove_event_photo", {
      p_actor_auth_user_id: user.id,
      p_event_id: command.eventId,
      p_photo_id: command.photoId,
      p_expected_version: command.expectedVersion,
      p_request_id: command.requestId,
      p_reason: command.reason,
      p_confirm: true,
    });
    if (error) return rpcFailure(String(error.message || ""));
    const result = sanitizeResult(data, command);
    if (!result) return json({ code: "PHOTO_REMOVAL_UNAVAILABLE" }, 503);
    return json(result);
  } catch {
    return json({ code: "PHOTO_REMOVAL_UNAVAILABLE" }, 503);
  }
});
