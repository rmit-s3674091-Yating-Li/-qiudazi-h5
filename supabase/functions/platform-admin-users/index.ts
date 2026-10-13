import { createClient } from "npm:@supabase/supabase-js@2.112.4";

// The authenticated actor is resolved by Edge, then reauthorized by the
// service-role-only SQL RPC on every request. Never accept a browser actor ID.
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
const timestamp = (value: unknown): value is string =>
  typeof value === "string" && isoWithZone.test(value) && Number.isFinite(Date.parse(value));

type UserQuery = { pageSize: number; beforeCreatedAt: string | null; beforeId: string | null };
function parseQuery(value: unknown): UserQuery | null {
  if (!record(value) || Object.keys(value).some((key) => key !== "page_size" && key !== "before")) return null;
  const pageSize = value.page_size === undefined ? 20 : value.page_size;
  if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return null;
  if (value.before === undefined || value.before === null) {
    return { pageSize, beforeCreatedAt: null, beforeId: null };
  }
  if (!record(value.before) || Object.keys(value.before).length !== 2 ||
      !Object.hasOwn(value.before, "created_at") || !Object.hasOwn(value.before, "id")) return null;
  if (!timestamp(value.before.created_at) || typeof value.before.id !== "string" || !uuid.test(value.before.id)) return null;
  return { pageSize, beforeCreatedAt: value.before.created_at, beforeId: value.before.id };
}

// Fail closed on an unexpected SQL response. Explicitly project the four
// approved public profile fields so future schema additions cannot leak PII.
function sanitizePage(value: unknown, pageSize: number) {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > pageSize ||
      !(value.next_cursor === null || record(value.next_cursor))) return null;
  const items = [];
  for (const row of value.items) {
    if (!record(row) || Object.keys(row).length !== 4 ||
        !Object.hasOwn(row, "id") || !Object.hasOwn(row, "nickname") ||
        !Object.hasOwn(row, "profile_status") || !Object.hasOwn(row, "created_at") ||
        typeof row.id !== "string" || !uuid.test(row.id) ||
        !(row.nickname === null || (typeof row.nickname === "string" && row.nickname.length <= 120)) ||
        typeof row.profile_status !== "string" || row.profile_status.length > 64 ||
        !timestamp(row.created_at)) return null;
    items.push({ id: row.id, nickname: row.nickname, profile_status: row.profile_status, created_at: row.created_at });
  }
  const cursor = value.next_cursor;
  if (cursor !== null && (!record(cursor) || Object.keys(cursor).length !== 2 ||
      !timestamp(cursor.created_at) || typeof cursor.id !== "string" || !uuid.test(cursor.id) ||
      items.length === 0)) return null;
  return { items, next_cursor: cursor === null ? null : { created_at: cursor.created_at, id: cursor.id } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const token = (req.headers.get("Authorization") || "").match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ code: "AUTH_REQUIRED" }, 401);
  let query: UserQuery | null;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json({ code: "INVALID_USER_QUERY" }, 413);
    query = parseQuery(JSON.parse(raw));
  } catch {
    return json({ code: "INVALID_USER_QUERY" }, 400);
  }
  if (!query) return json({ code: "INVALID_USER_QUERY" }, 400);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ code: "SERVICE_UNAVAILABLE" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ code: "AUTH_REQUIRED" }, 401);
    const { data, error } = await client.rpc("platform_admin_list_users", {
      p_actor_auth_user_id: user.id,
      p_page_size: query.pageSize,
      p_before_created_at: query.beforeCreatedAt,
      p_before_id: query.beforeId,
    });
    if (error) {
      if (String(error.message).includes("PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN")) {
        return json({ code: "PLATFORM_ADMIN_FORBIDDEN" }, 403);
      }
      throw new Error("USER_DIRECTORY_READ_FAILED");
    }
    const page = sanitizePage(data, query.pageSize);
    if (!page) throw new Error("INVALID_USER_DIRECTORY_RESPONSE");
    return json(page);
  } catch {
    return json({ code: "USER_DIRECTORY_UNAVAILABLE" }, 503);
  }
});
