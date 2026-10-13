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
const validId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const previewTtlSeconds = 60;

function parseRequest(value: unknown): { eventId: string; photoId: string } | null {
  if (!record(value) || Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "event_id") || !Object.hasOwn(value, "photo_id") ||
      !validId(value.event_id) || !validId(value.photo_id)) return null;
  return { eventId: value.event_id, photoId: value.photo_id };
}

function validStorageKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 3 || value.length > 1024 ||
      value.startsWith("/") || value.includes("\\") || value.includes("%") ||
      value.includes("?") || value.includes("#")) return false;
  return value.split("/").every((part) => part !== "." && part !== ".." &&
    /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(part));
}

function safePreviewSource(value: unknown, eventId: string, photoId: string): string | null {
  if (!record(value) || Object.keys(value).length !== 4 ||
      !Object.hasOwn(value, "photo_id") || !Object.hasOwn(value, "event_id") ||
      !Object.hasOwn(value, "version") || !Object.hasOwn(value, "watermarked_path") ||
      value.event_id !== eventId || value.photo_id !== photoId ||
      typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1 ||
      !validStorageKey(value.watermarked_path)) return null;
  return value.watermarked_path;
}

function safeSignedUrl(value: unknown, supabaseUrl: string): value is string {
  if (typeof value !== "string") return false;
  try {
    const signed = new URL(value);
    const backend = new URL(supabaseUrl);
    return signed.protocol === "https:" && signed.origin === backend.origin &&
      signed.pathname.startsWith("/storage/v1/object/sign/event-photos/") &&
      signed.searchParams.has("token") && !signed.username && !signed.password && !signed.hash;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const token = req.headers.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ code: "AUTH_REQUIRED" }, 401);
  let query: { eventId: string; photoId: string } | null;
  try {
    const body = await req.text();
    if (body.length > 1024) return json({ code: "INVALID_PHOTO_PREVIEW_REQUEST" }, 413);
    query = parseRequest(JSON.parse(body));
  } catch {
    return json({ code: "INVALID_PHOTO_PREVIEW_REQUEST" }, 400);
  }
  if (!query) return json({ code: "INVALID_PHOTO_PREVIEW_REQUEST" }, 400);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ code: "PHOTO_PREVIEW_UNAVAILABLE" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user || !validId(user.id)) return json({ code: "AUTH_REQUIRED" }, 401);
    const { data, error } = await client.rpc("platform_admin_get_photo_preview_source", {
      p_actor_auth_user_id: user.id,
      p_event_id: query.eventId,
      p_photo_id: query.photoId,
    });
    if (error) {
      const message = String(error.message ?? "");
      if (message.includes("PLATFORM_ADMIN_FORBIDDEN")) return json({ code: "PLATFORM_ADMIN_FORBIDDEN" }, 403);
      if (message.includes("PHOTO_NOT_FOUND") || message.includes("PHOTO_PREVIEW_UNAVAILABLE")) {
        return json({ code: "PHOTO_NOT_FOUND" }, 404);
      }
      throw new Error("PHOTO_PREVIEW_LOOKUP_FAILED");
    }
    const path = safePreviewSource(data, query.eventId, query.photoId);
    if (!path) throw new Error("INVALID_PHOTO_PREVIEW_SOURCE");
    const { data: signed, error: signError } = await client.storage.from("event-photos")
      .createSignedUrl(path, previewTtlSeconds);
    if (signError || !safeSignedUrl(signed?.signedUrl, url)) throw new Error("PHOTO_PREVIEW_SIGN_FAILED");
    return json({ url: signed.signedUrl, expires_in: previewTtlSeconds });
  } catch {
    return json({ code: "PHOTO_PREVIEW_UNAVAILABLE" }, 503);
  }
});
