import { createClient } from "npm:@supabase/supabase-js@2.112.4";

// P2 reports metadata triage only. No reporter identity, report narrative,
// mutations or user-supplied actor identity crosses this boundary.
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
const targetKinds = ["user", "event", "match", "photo"] as const;
const categories = ["safety", "conduct", "spam", "privacy", "other"] as const;
const statuses = ["open", "in_review", "resolved", "dismissed"] as const;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const validTime = (value: unknown): value is string =>
  typeof value === "string" && zonedTime.test(value) && Number.isFinite(Date.parse(value));
const oneOf = (value: unknown, allowed: readonly string[]): value is string =>
  typeof value === "string" && allowed.includes(value);

type Query = {
  pageSize: number;
  status: string | null;
  beforeCreatedAt: string | null;
  beforeId: string | null;
};
function parseQuery(value: unknown): Query | null {
  if (!record(value) || Object.keys(value).some((key) => !["page_size", "status", "before"].includes(key))) return null;
  const pageSize = value.page_size === undefined ? 20 : value.page_size;
  if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return null;
  const status = value.status === undefined || value.status === null ? null : value.status;
  if (status !== null && !oneOf(status, statuses)) return null;
  if (value.before === undefined || value.before === null) {
    return { pageSize, status, beforeCreatedAt: null, beforeId: null };
  }
  if (!record(value.before) || Object.keys(value.before).length !== 2 ||
      !Object.hasOwn(value.before, "created_at") || !Object.hasOwn(value.before, "id") ||
      !validTime(value.before.created_at) || !validId(value.before.id)) return null;
  return {
    pageSize, status,
    beforeCreatedAt: value.before.created_at,
    beforeId: value.before.id,
  };
}

// Fail closed on schema drift. Explicitly project the seven approved fields;
// future sensitive database columns must never become browser-visible.
function sanitizePage(value: unknown, query: Query) {
  if (!record(value) || Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "items") || !Object.hasOwn(value, "next_cursor") ||
      !Array.isArray(value.items) || value.items.length > query.pageSize ||
      !(value.next_cursor === null || record(value.next_cursor))) return null;
  const items: Array<{ id: string; target_kind: string; target_id: string; category: string;
    status: string; version: number; created_at: string }> = [];
  let previous: { id: string; created_at: string } | null = null;
  const seen = new Set<string>();
  for (const row of value.items) {
    if (!record(row) || Object.keys(row).length !== 7 ||
        Object.keys(row).some((key) => !["id", "target_kind", "target_id", "category", "status", "version", "created_at"].includes(key)) ||
        !validId(row.id) || !validId(row.target_id) ||
        !oneOf(row.target_kind, targetKinds) || !oneOf(row.category, categories) ||
        !oneOf(row.status, statuses) || (query.status !== null && row.status !== query.status) ||
        typeof row.version !== "number" || !Number.isSafeInteger(row.version) || row.version < 1 ||
        !validTime(row.created_at) || seen.has(row.id.toLowerCase())) return null;
    if (previous && (Date.parse(row.created_at) > Date.parse(previous.created_at) ||
        (Date.parse(row.created_at) === Date.parse(previous.created_at) &&
          row.id.toLowerCase() >= previous.id.toLowerCase()))) return null;
    if (query.beforeCreatedAt && (Date.parse(row.created_at) > Date.parse(query.beforeCreatedAt) ||
        (Date.parse(row.created_at) === Date.parse(query.beforeCreatedAt) &&
          row.id.toLowerCase() >= query.beforeId!.toLowerCase()))) return null;
    seen.add(row.id.toLowerCase());
    items.push({ id: row.id, target_kind: row.target_kind, target_id: row.target_id,
      category: row.category, status: row.status, version: row.version, created_at: row.created_at });
    previous = { id: row.id, created_at: row.created_at };
  }
  const cursor = value.next_cursor;
  if (cursor === null) return { items, next_cursor: null };
  if (!record(cursor) || Object.keys(cursor).length !== 2 ||
      !Object.hasOwn(cursor, "created_at") || !Object.hasOwn(cursor, "id") ||
      !validTime(cursor.created_at) || !validId(cursor.id) || items.length !== query.pageSize ||
      cursor.created_at !== items[items.length - 1].created_at ||
      cursor.id.toLowerCase() !== items[items.length - 1].id.toLowerCase()) return null;
  return { items, next_cursor: { created_at: cursor.created_at, id: cursor.id } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const token = (req.headers.get("Authorization") || "").match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ code: "AUTH_REQUIRED" }, 401);
  let query: Query | null;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json({ code: "INVALID_REPORT_QUERY" }, 413);
    query = parseQuery(JSON.parse(raw));
  } catch {
    return json({ code: "INVALID_REPORT_QUERY" }, 400);
  }
  if (!query) return json({ code: "INVALID_REPORT_QUERY" }, 400);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ code: "SERVICE_UNAVAILABLE" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user || !validId(user.id)) return json({ code: "AUTH_REQUIRED" }, 401);
    const { data, error } = await client.rpc("platform_admin_list_reports", {
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
      throw new Error("REPORT_DIRECTORY_READ_FAILED");
    }
    const page = sanitizePage(data, query);
    if (!page) throw new Error("INVALID_REPORT_DIRECTORY_RESPONSE");
    return json(page);
  } catch {
    return json({ code: "REPORT_DIRECTORY_UNAVAILABLE" }, 503);
  }
});
