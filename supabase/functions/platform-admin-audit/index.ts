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
const isoWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  if (typeof createdAt !== "string" || !isoWithZone.test(createdAt) || !Number.isFinite(Date.parse(createdAt)) ||
      typeof id !== "string" || !uuid.test(id)) return null;
  return { pageSize, beforeCreatedAt: createdAt, beforeId: id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const token = (req.headers.get("Authorization") || "").match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ code: "AUTH_REQUIRED" }, 401);

  // A bounded request body prevents accidental unbounded JSON parsing.
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
    // The SQL RPC rechecks active platform_ops.admin_members on EVERY request.
    // This read-only Edge route does not trust a client-supplied admin role.
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
    if (!record(data) || !Array.isArray(data.items) ||
        !(data.next_cursor === null || record(data.next_cursor))) {
      throw new Error("INVALID_AUDIT_RESPONSE");
    }
    return json({ items: data.items, next_cursor: data.next_cursor });
  } catch {
    // Do not leak SQL errors, JWTs, internal identifiers, or service-role details.
    return json({ code: "AUDIT_READ_UNAVAILABLE" }, 503);
  }
});
