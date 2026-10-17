import { createClient } from "npm:@supabase/supabase-js@2.112.4";

// Admin audit browsing is a separate read-only endpoint. The browser cannot
// choose the actor; the trusted Edge handler derives it from a verified JWT.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

type AuditQuery = {
  pageSize: number;
  beforeCreatedAt: string | null;
  beforeId: string | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validTime = (value: unknown): value is string =>
  typeof value === "string" && isoWithZone.test(value) && Number.isFinite(Date.parse(value));
const validId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const shortText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const auditFields = ["id", "actor_auth_user_id", "action", "target_kind", "target_id", "reason", "risk_level", "created_at"];
const exactFields = (value: Record<string, unknown>, fields: readonly string[]): boolean =>
  Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
const micros = (value: string): bigint => {
  const fraction = /\.(\d{1,6})(?=Z|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, "0").slice(3, 6) || "0");
};
const older = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
  micros(a.created_at) < micros(b.created_at) ||
  (micros(a.created_at) === micros(b.created_at) && a.id.toLowerCase() < b.id.toLowerCase());

function sanitizeAuditPage(value: unknown, query: AuditQuery) {
  if (!record(value) || !exactFields(value, ["items", "next_cursor"]) ||
      !Array.isArray(value.items) || value.items.length > query.pageSize ||
      !(value.next_cursor === null || record(value.next_cursor))) return null;
  const items: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let previous: { created_at: string; id: string } | null = query.beforeCreatedAt && query.beforeId
    ? { created_at: query.beforeCreatedAt, id: query.beforeId } : null;
  for (const row of value.items) {
    if (!record(row) || !exactFields(row, auditFields) || !validId(row.id) ||
        !validId(row.actor_auth_user_id) || !shortText(row.action, 80) ||
        !shortText(row.target_kind, 80) || !shortText(row.target_id, 128) ||
        !shortText(row.reason, 1000) ||
        (row.risk_level !== "low" && row.risk_level !== "high") ||
        !validTime(row.created_at) || seen.has(row.id.toLowerCase())) return null;
    const current = { created_at: row.created_at, id: row.id };
    if (previous && !older(current, previous)) return null;
    seen.add(row.id.toLowerCase());
    previous = current;
    items.push(Object.fromEntries(auditFields.map((field) => [field, row[field]])));
  }
  const cursor = value.next_cursor;
  if (cursor === null) return { items, next_cursor: null };
  if (!record(cursor) || !exactFields(cursor, ["created_at", "id"]) ||
      !validTime(cursor.created_at) || !validId(cursor.id) ||
      items.length !== query.pageSize ||
      cursor.created_at !== previous?.created_at ||
      cursor.id.toLowerCase() !== previous?.id.toLowerCase()) return null;
  return { items, next_cursor: { created_at: cursor.created_at, id: cursor.id } };
}

function parseAuditQuery(value: unknown): AuditQuery | null {
  if (!record(value) || Object.keys(value).some((key) => key !== "page_size" && key !== "before")) return null;
  const pageSize = value.page_size === undefined ? 25 : value.page_size;
  if (!Number.isInteger(pageSize) || typeof pageSize !== "number" || pageSize < 1 || pageSize > 50) return null;
  if (value.before === undefined || value.before === null) {
    return { pageSize, beforeCreatedAt: null, beforeId: null };
  }
  if (!record(value.before) || Object.keys(value.before).length !== 2 ||
      !Object.hasOwn(value.before, "created_at") || !Object.hasOwn(value.before, "id")) return null;
  const { created_at: createdAt, id } = value.before;
  if (!validTime(createdAt) || !validId(id)) return null;
  return { pageSize, beforeCreatedAt: createdAt, beforeId: id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const token = (req.headers.get("Authorization") || "").match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ code: "AUTH_REQUIRED" }, 401);

  let query: AuditQuery | null;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json({ code: "INVALID_AUDIT_QUERY" }, 413);
    query = parseAuditQuery(JSON.parse(raw));
  } catch {
    return json({ code: "INVALID_AUDIT_QUERY" }, 400);
  }
  if (!query) return json({ code: "INVALID_AUDIT_QUERY" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ code: "SERVICE_UNAVAILABLE" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return json({ code: "AUTH_REQUIRED" }, 401);
    const { data, error } = await client.rpc("platform_admin_list_audit", {
      p_actor_auth_user_id: user.id,
      p_page_size: query.pageSize,
      p_before_created_at: query.beforeCreatedAt,
      p_before_id: query.beforeId,
    });
    if (error) {
      if (String(error.message).includes("PLATFORM_ADMIN_FORBIDDEN")) {
        return json({ code: "PLATFORM_ADMIN_FORBIDDEN" }, 403);
      }
      throw new Error("AUDIT_READ_FAILED");
    }
    const page = sanitizeAuditPage(data, query);
    if (!page) throw new Error("INVALID_AUDIT_RESPONSE");
    return json(page);
  } catch {
    return json({ code: "AUDIT_READ_UNAVAILABLE" }, 503);
  }
});
