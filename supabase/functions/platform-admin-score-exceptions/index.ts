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
const zonedTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const anomalyCodes = ["FINISHED_WITHOUT_WINNER", "UNFINISHED_WITH_WINNER", "WINNER_NOT_IN_MATCH", "DIRECT_WITH_ACTIVE_POINTS"] as const;
const stages = ["round_robin", "group", "knockout"] as const;
const statuses = ["not_started", "ongoing", "finished"] as const;
const modes = ["direct", "live"] as const;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === "string" && uuid.test(v);
const validTime = (v: unknown): v is string => typeof v === "string" && zonedTime.test(v) && Number.isFinite(Date.parse(v));
const oneOf = (v: unknown, options: readonly string[]): v is string => typeof v === "string" && options.includes(v);
const version = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1;
const timestampMicros = (value: string): bigint => {
  const fraction = /\.(\d{1,6})(?=Z|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, "0").slice(3));
};
const strictlyOlder = (left: { created_at: string; id: string }, right: { created_at: string; id: string }) => {
  const a = timestampMicros(left.created_at), b = timestampMicros(right.created_at);
  return a < b || (a === b && left.id.toLowerCase() < right.id.toLowerCase());
};

type Query = { eventId: string; pageSize: number; beforeCreatedAt: string | null; beforeId: string | null };
function parseQuery(value: unknown): Query | null {
  if (!record(value) || Object.keys(value).some((key) => !["event_id", "page_size", "before"].includes(key)) || !validId(value.event_id)) return null;
  const pageSize = value.page_size === undefined ? 20 : value.page_size;
  if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return null;
  if (value.before === undefined || value.before === null) return { eventId: value.event_id, pageSize, beforeCreatedAt: null, beforeId: null };
  const before = value.before;
  if (!record(before) || Object.keys(before).length !== 2 || !Object.hasOwn(before, "created_at") || !Object.hasOwn(before, "id") || !validTime(before.created_at) || !validId(before.id)) return null;
  return { eventId: value.event_id, pageSize, beforeCreatedAt: before.created_at, beforeId: before.id };
}

function sanitizePage(value: unknown, query: Query) {
  if (!record(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, "items") || !Object.hasOwn(value, "next_cursor") || !Array.isArray(value.items) || value.items.length > query.pageSize || !(value.next_cursor === null || record(value.next_cursor))) return null;
  const allowed = ["match_id", "event_id", "stage", "round_no", "status", "scoring_mode", "version", "anomaly_code", "created_at"];
  const items: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let previous: { created_at: string; id: string } | null = query.beforeCreatedAt && query.beforeId ? { created_at: query.beforeCreatedAt, id: query.beforeId } : null;
  for (const row of value.items) {
    if (!record(row) || Object.keys(row).length !== allowed.length || allowed.some((key) => !Object.hasOwn(row, key)) || !validId(row.match_id) || String(row.event_id).toLowerCase() !== query.eventId.toLowerCase() || !oneOf(row.stage, stages) || !Number.isSafeInteger(row.round_no) || (row.round_no as number) < 1 || !oneOf(row.status, statuses) || !(row.scoring_mode === null || oneOf(row.scoring_mode, modes)) || !version(row.version) || !oneOf(row.anomaly_code, anomalyCodes) || !validTime(row.created_at) || seen.has(String(row.match_id).toLowerCase())) return null;
    const current = { created_at: String(row.created_at), id: String(row.match_id) };
    if (previous && !strictlyOlder(current, previous)) return null;
    seen.add(current.id.toLowerCase());
    previous = current;
    items.push(Object.fromEntries(allowed.map((key) => [key, row[key]])));
  }
  const cursor = value.next_cursor;
  if (cursor === null) return { items, next_cursor: null };
  if (!record(cursor) || Object.keys(cursor).length !== 2 || !Object.hasOwn(cursor, "created_at") || !Object.hasOwn(cursor, "id") || !validTime(cursor.created_at) || !validId(cursor.id) || items.length !== query.pageSize || cursor.created_at !== items[items.length - 1].created_at || cursor.id.toLowerCase() !== String(items[items.length - 1].match_id).toLowerCase()) return null;
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
    if (raw.length > 2048) return json({ code: "INVALID_EXCEPTION_QUERY" }, 413);
    query = parseQuery(JSON.parse(raw));
  } catch { return json({ code: "INVALID_EXCEPTION_QUERY" }, 400); }
  if (!query) return json({ code: "INVALID_EXCEPTION_QUERY" }, 400);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ code: "SERVICE_UNAVAILABLE" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user || !validId(user.id)) return json({ code: "AUTH_REQUIRED" }, 401);
    const { data, error } = await client.rpc("platform_admin_list_score_exceptions", {
      p_actor_auth_user_id: user.id, p_event_id: query.eventId, p_page_size: query.pageSize,
      p_before_created_at: query.beforeCreatedAt, p_before_id: query.beforeId,
    });
    if (error) {
      if (String(error.message).includes("PLATFORM_ADMIN_FORBIDDEN")) return json({ code: "PLATFORM_ADMIN_FORBIDDEN" }, 403);
      throw new Error("EXCEPTION_DIRECTORY_READ_FAILED");
    }
    const page = sanitizePage(data, query);
    if (!page) throw new Error("INVALID_EXCEPTION_DIRECTORY_RESPONSE");
    return json(page);
  } catch { return json({ code: "EXCEPTION_DIRECTORY_UNAVAILABLE" }, 503); }
});
