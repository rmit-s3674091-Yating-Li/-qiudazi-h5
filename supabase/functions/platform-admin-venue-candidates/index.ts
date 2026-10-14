import { createClient } from "npm:@supabase/supabase-js@2.112.4";

// Event-submitted venue names are UNVERIFIED candidates, not a venue registry.
// JWT identity is resolved here; SQL independently rechecks active admin access.
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
const isoWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validId = (value: unknown): value is string =>
  typeof value === "string" && uuid.test(value);
const validTime = (value: unknown): value is string =>
  typeof value === "string" && isoWithZone.test(value) && Number.isFinite(Date.parse(value));

type Query = { pageSize: number; beforeCreatedAt: string | null; beforeEventId: string | null };
function parseQuery(value: unknown): Query | null {
  if (!record(value) || Object.keys(value).some((key) => !["page_size", "before"].includes(key))) return null;
  const pageSize = value.page_size === undefined ? 20 : value.page_size;
  if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return null;
  if (value.before === undefined || value.before === null) {
    return { pageSize, beforeCreatedAt: null, beforeEventId: null };
  }
  const before = value.before;
  if (!record(before) || Object.keys(before).length !== 2 ||
      !Object.hasOwn(before, "created_at") || !Object.hasOwn(before, "event_id") ||
      !validTime(before.created_at) || !validId(before.event_id)) return null;
  return { pageSize, beforeCreatedAt: before.created_at, beforeEventId: before.event_id };
}

// Fail closed if SQL changes shape. Explicit projection prevents accidentally
// leaking venue addresses, coordinates, owner IDs, or private Event details.
function sanitizePage(value: unknown, pageSize: number) {
  if (!record(value) || Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "items") || !Object.hasOwn(value, "next_cursor") ||
      !Array.isArray(value.items) || value.items.length > pageSize ||
      !(value.next_cursor === null || record(value.next_cursor))) return null;
  const allowed = ["event_id", "venue_name", "city", "event_version", "created_at", "verification_status"];
  const items: Array<{
    event_id: string; venue_name: string; city: string | null;
    event_version: number; created_at: string; verification_status: "not_verified";
  }> = [];
  const seen = new Set<string>();
  for (const row of value.items) {
    if (!record(row) || Object.keys(row).length !== allowed.length ||
        Object.keys(row).some((key) => !allowed.includes(key)) ||
        !validId(row.event_id) || seen.has(row.event_id.toLowerCase()) ||
        typeof row.venue_name !== "string" || !row.venue_name.trim() || row.venue_name.length > 500 ||
        !(row.city === null || (typeof row.city === "string" && row.city.length <= 200)) ||
        typeof row.event_version !== "number" || !Number.isSafeInteger(row.event_version) || row.event_version < 1 ||
        !validTime(row.created_at) || row.verification_status !== "not_verified") return null;
    if (items.length > 0) {
      const previous = items[items.length - 1];
      const currentTime = Date.parse(row.created_at);
      const previousTime = Date.parse(previous.created_at);
      if (currentTime > previousTime ||
          (currentTime === previousTime && row.event_id.toLowerCase() >= previous.event_id.toLowerCase())) return null;
    }
    seen.add(row.event_id.toLowerCase());
    items.push({
      event_id: row.event_id, venue_name: row.venue_name, city: row.city,
      event_version: row.event_version, created_at: row.created_at,
      verification_status: "not_verified",
    });
  }
  const cursor = value.next_cursor;
  if (cursor === null) return { items, next_cursor: null };
  if (!record(cursor) || Object.keys(cursor).length !== 2 ||
      !Object.hasOwn(cursor, "created_at") || !Object.hasOwn(cursor, "event_id") ||
      !validTime(cursor.created_at) || !validId(cursor.event_id) ||
      items.length !== pageSize ||
      cursor.created_at !== items[items.length - 1].created_at ||
      cursor.event_id.toLowerCase() !== items[items.length - 1].event_id.toLowerCase()) return null;
  return { items, next_cursor: { created_at: cursor.created_at, event_id: cursor.event_id } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const token = (req.headers.get("Authorization") || "").match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ code: "AUTH_REQUIRED" }, 401);
  let query: Query | null;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json({ code: "INVALID_VENUE_CANDIDATE_QUERY" }, 413);
    query = parseQuery(JSON.parse(raw));
  } catch {
    return json({ code: "INVALID_VENUE_CANDIDATE_QUERY" }, 400);
  }
  if (!query) return json({ code: "INVALID_VENUE_CANDIDATE_QUERY" }, 400);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ code: "SERVICE_UNAVAILABLE" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user || !validId(user.id)) return json({ code: "AUTH_REQUIRED" }, 401);
    const { data, error } = await client.rpc("platform_admin_list_event_venue_candidates", {
      p_actor_auth_user_id: user.id,
      p_page_size: query.pageSize,
      p_before_created_at: query.beforeCreatedAt,
      p_before_event_id: query.beforeEventId,
    });
    if (error) {
      if (String(error.message).includes("PLATFORM_ADMIN_FORBIDDEN")) {
        return json({ code: "PLATFORM_ADMIN_FORBIDDEN" }, 403);
      }
      throw new Error("VENUE_CANDIDATE_READ_FAILED");
    }
    const page = sanitizePage(data, query.pageSize);
    if (!page) throw new Error("INVALID_VENUE_CANDIDATE_RESPONSE");
    return json(page);
  } catch {
    return json({ code: "VENUE_CANDIDATE_DIRECTORY_UNAVAILABLE" }, 503);
  }
});
