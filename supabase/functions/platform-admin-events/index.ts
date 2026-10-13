import { createClient } from "npm:@supabase/supabase-js@2.112.4";

// Read-only administrative index. JWT identity comes from Edge authentication;
// the service-only SQL RPC rechecks live platform membership on every request.
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
const zonedTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const statuses = ["signup", "locked", "ongoing", "finished", "cancelled"] as const;
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const validTime = (v: unknown): v is string =>
  typeof v === "string" && zonedTime.test(v) && Number.isFinite(Date.parse(v));
const validId = (v: unknown): v is string => typeof v === "string" && uuid.test(v);
const oneOf = (v: unknown, choices: readonly string[]): v is string =>
  typeof v === "string" && choices.includes(v);

type Query = {
  pageSize: number;
  beforeCreatedAt: string | null;
  beforeId: string | null;
  status: string | null;
};
function parseQuery(value: unknown): Query | null {
  if (!record(value) || Object.keys(value).some((key) => !["page_size", "before", "status"].includes(key))) return null;
  const pageSize = value.page_size === undefined ? 20 : value.page_size;
  if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return null;
  let status: string | null = null;
  if (value.status !== undefined && value.status !== null) {
    if (!oneOf(value.status, statuses)) return null;
    status = value.status;
  }
  if (value.before === undefined || value.before === null) {
    return { pageSize, beforeCreatedAt: null, beforeId: null, status };
  }
  const before = value.before;
  if (!record(before) || Object.keys(before).length !== 2 ||
      !Object.hasOwn(before, "created_at") || !Object.hasOwn(before, "id")) return null;
  const createdAt = before.created_at, id = before.id;
  if (!validTime(createdAt) || !validId(id)) return null;
  return { pageSize, beforeCreatedAt: createdAt, beforeId: id, status };
}

// Explicitly project the narrow SQL allowlist; never pass a raw database row
// to the browser, even if a future migration adds sensitive columns.
function sanitizePage(value: unknown, pageSize: number) {
  if (!record(value) || Object.keys(value).some((key) => key !== "items" && key !== "next_cursor") ||
      !Array.isArray(value.items) || value.items.length > pageSize ||
      !(value.next_cursor === null || record(value.next_cursor))) return null;
  const items = [];
  const allowed = ["id", "name", "owner_user_id", "status", "version", "visibility",
    "event_mode", "match_type", "format", "city", "event_date", "created_at"];
  for (const row of value.items) {
    if (!record(row) || Object.keys(row).length !== allowed.length ||
        Object.keys(row).some((key) => !allowed.includes(key)) ||
        !validId(row.id) || !validId(row.owner_user_id) ||
        typeof row.name !== "string" || row.name.length < 1 || row.name.length > 80 ||
        !oneOf(row.status, statuses) || typeof row.version !== "number" || !Number.isSafeInteger(row.version) || row.version < 1 ||
        !oneOf(row.visibility, ["public", "private"]) ||
        !oneOf(row.event_mode, ["standard", "quick"]) ||
        !oneOf(row.match_type, ["singles", "doubles"]) ||
        !oneOf(row.format, ["round_robin", "knockout", "group_knockout"]) ||
        !(row.city === null || (typeof row.city === "string" && row.city.length <= 120)) ||
        !(row.event_date === null || (typeof row.event_date === "string" && dateOnly.test(row.event_date))) ||
        !validTime(row.created_at)) return null;
    items.push(Object.fromEntries(allowed.map((key) => [key, row[key]])));
  }
  const cursor = value.next_cursor;
  if (cursor === null) return { items, next_cursor: null };
  if (!record(cursor) || Object.keys(cursor).length !== 2 || items.length === 0) return null;
  const createdAt = cursor.created_at, id = cursor.id;
  if (!validTime(createdAt) || !validId(id) ||
      createdAt !== items[items.length - 1].created_at ||
      id !== items[items.length - 1].id) return null;
  return { items, next_cursor: { created_at: createdAt, id } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const token = (req.headers.get("Authorization") || "").match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ code: "AUTH_REQUIRED" }, 401);
  let query: Query | null;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json({ code: "INVALID_EVENT_QUERY" }, 413);
    query = parseQuery(JSON.parse(raw));
  } catch {
    return json({ code: "INVALID_EVENT_QUERY" }, 400);
  }
  if (!query) return json({ code: "INVALID_EVENT_QUERY" }, 400);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ code: "SERVICE_UNAVAILABLE" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user || !validId(user.id)) return json({ code: "AUTH_REQUIRED" }, 401);
    const { data, error } = await client.rpc("platform_admin_list_events", {
      p_actor_auth_user_id: user.id,
      p_page_size: query.pageSize,
      p_before_created_at: query.beforeCreatedAt,
      p_before_id: query.beforeId,
      p_status: query.status,
    });
    if (error) {
      if (String(error.message).includes("PLATFORM_ADMIN_FORBIDDEN")) {
        return json({ code: "PLATFORM_ADMIN_FORBIDDEN" }, 403);
      }
      throw new Error("EVENT_DIRECTORY_READ_FAILED");
    }
    const page = sanitizePage(data, query.pageSize);
    if (!page) throw new Error("INVALID_EVENT_DIRECTORY_RESPONSE");
    return json(page);
  } catch {
    return json({ code: "EVENT_DIRECTORY_UNAVAILABLE" }, 503);
  }
});
