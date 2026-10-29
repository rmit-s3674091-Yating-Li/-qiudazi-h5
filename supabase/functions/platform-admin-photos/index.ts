import { createClient } from "npm:@supabase/supabase-js@2.112.4";

// Read-only photo metadata triage. Never expose Storage paths, signed URLs,
// uploader identities, or trust an actor identity supplied by the browser.
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
const isoWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === "string" && uuid.test(v);
const validTime = (v: unknown): v is string =>
  typeof v === "string" && isoWithZone.test(v) && Number.isFinite(Date.parse(v));
const timestampMicros = (value: string): bigint => {
  const fraction = /\.(\d{1,6})(?=Z|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, "0").slice(3) || "0");
};
const strictlyOlder = (
  left: { uploaded_at: string; id: string },
  right: { uploaded_at: string; id: string },
) => {
  const a = timestampMicros(left.uploaded_at), b = timestampMicros(right.uploaded_at);
  return a < b || (a === b && left.id.toLowerCase() < right.id.toLowerCase());
};

type PhotoQuery = {
  eventId: string;
  pageSize: number;
  beforeUploadedAt: string | null;
  beforeId: string | null;
};
function parseQuery(value: unknown): PhotoQuery | null {
  if (!record(value) || Object.keys(value).some((key) =>
    !["event_id", "page_size", "before"].includes(key)) || !validId(value.event_id)) return null;
  const pageSize = value.page_size === undefined ? 20 : value.page_size;
  if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return null;
  if (value.before === undefined || value.before === null) {
    return { eventId: value.event_id, pageSize, beforeUploadedAt: null, beforeId: null };
  }
  if (!record(value.before) || Object.keys(value.before).length !== 2 ||
      !Object.hasOwn(value.before, "uploaded_at") || !Object.hasOwn(value.before, "id") ||
      !validTime(value.before.uploaded_at) || !validId(value.before.id)) return null;
  return {
    eventId: value.event_id, pageSize,
    beforeUploadedAt: value.before.uploaded_at, beforeId: value.before.id,
  };
}

function sanitizePage(value: unknown, query: PhotoQuery) {
  if (!record(value) || Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "items") || !Object.hasOwn(value, "next_cursor") ||
      !Array.isArray(value.items) || value.items.length > query.pageSize ||
      !(value.next_cursor === null || record(value.next_cursor))) return null;
  const items: Array<{ id: string; event_id: string; version: number; uploaded_at: string }> = [];
  const seen = new Set<string>();
  let previous: { uploaded_at: string; id: string } | null =
    query.beforeUploadedAt && query.beforeId
      ? { uploaded_at: query.beforeUploadedAt, id: query.beforeId }
      : null;
  for (const row of value.items) {
    if (!record(row) || Object.keys(row).length !== 4 ||
        Object.keys(row).some((key) => !["id", "event_id", "version", "uploaded_at"].includes(key)) ||
        !validId(row.id) || !validId(row.event_id) ||
        row.event_id.toLowerCase() !== query.eventId.toLowerCase() ||
        typeof row.version !== "number" || !Number.isSafeInteger(row.version) || row.version < 1 ||
        !validTime(row.uploaded_at) || seen.has(row.id.toLowerCase())) return null;
    const current = { uploaded_at: row.uploaded_at, id: row.id };
    if (previous && !strictlyOlder(current, previous)) return null;
    seen.add(row.id.toLowerCase());
    previous = current;
    items.push({ id: row.id, event_id: row.event_id, version: row.version, uploaded_at: row.uploaded_at });
  }
  const cursor = value.next_cursor;
  if (cursor === null) return { items, next_cursor: null };
  if (!record(cursor) || Object.keys(cursor).length !== 2 ||
      !Object.hasOwn(cursor, "uploaded_at") || !Object.hasOwn(cursor, "id") ||
      !validTime(cursor.uploaded_at) || !validId(cursor.id) ||
      items.length !== query.pageSize ||
      cursor.uploaded_at !== items[items.length - 1].uploaded_at ||
      cursor.id.toLowerCase() !== items[items.length - 1].id.toLowerCase()) return null;
  return { items, next_cursor: { uploaded_at: cursor.uploaded_at, id: cursor.id } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const token = (req.headers.get("Authorization") || "").match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ code: "AUTH_REQUIRED" }, 401);
  let query: PhotoQuery | null;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json({ code: "INVALID_PHOTO_QUERY" }, 413);
    query = parseQuery(JSON.parse(raw));
  } catch {
    return json({ code: "INVALID_PHOTO_QUERY" }, 400);
  }
  if (!query) return json({ code: "INVALID_PHOTO_QUERY" }, 400);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ code: "SERVICE_UNAVAILABLE" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user || !validId(user.id)) return json({ code: "AUTH_REQUIRED" }, 401);
    const { data, error } = await client.rpc("platform_admin_list_event_photo_metadata", {
      p_actor_auth_user_id: user.id,
      p_event_id: query.eventId,
      p_page_size: query.pageSize,
      p_before_uploaded_at: query.beforeUploadedAt,
      p_before_id: query.beforeId,
    });
    if (error) {
      if (String(error.message).includes("PLATFORM_ADMIN_FORBIDDEN")) {
        return json({ code: "PLATFORM_ADMIN_FORBIDDEN" }, 403);
      }
      throw new Error("PHOTO_DIRECTORY_READ_FAILED");
    }
    const page = sanitizePage(data, query);
    if (!page) throw new Error("INVALID_PHOTO_DIRECTORY_RESPONSE");
    return json(page);
  } catch {
    return json({ code: "PHOTO_DIRECTORY_UNAVAILABLE" }, 503);
  }
});
