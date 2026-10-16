import { createClient } from "npm:@supabase/supabase-js@2.112.4";

// UI discovery only. This endpoint is NOT an authorization boundary for writes.
// tournament-command and v8_commit_participant_round_robin_point must independently
// reauthorize the verified actor, membership, match state and versions in the write transaction.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Authorization" },
  });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseRequest(value: unknown): { event_id: string; match_id: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 2 || !uuid.test(String(body.event_id ?? "")) || !uuid.test(String(body.match_id ?? ""))) return null;
  if (typeof body.event_id !== "string" || typeof body.match_id !== "string") return null;
  return { event_id: body.event_id, match_id: body.match_id };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return json({ error: "AUTH_REQUIRED" }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "INVALID_REQUEST" }, 400); }
  const args = parseRequest(body);
  if (!args) return json({ error: "INVALID_REQUEST" }, 400);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "SERVICE_UNAVAILABLE" }, 503);

  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user?.id) return json({ error: "AUTH_REQUIRED" }, 401);

    const { data: active, error: eligibilityError } = await client.rpc("v8_active_match_participant", {
      p_event_id: args.event_id,
      p_match_id: args.match_id,
      p_actor_auth_user_id: user.id,
    });
    if (eligibilityError) throw eligibilityError;
    if (active !== true) return json({ eligible: false });

    const [eventResponse, matchResponse] = await Promise.all([
      client.from("events").select("id,format,status").eq("id", args.event_id).maybeSingle(),
      client.from("matches").select("id,event_id,stage,status,scoring_mode,is_bye,entry_a_id,entry_b_id")
        .eq("id", args.match_id).maybeSingle(),
    ]);
    if (eventResponse.error || matchResponse.error) throw eventResponse.error || matchResponse.error;
    const event = eventResponse.data, match = matchResponse.data;
    const eligible = Boolean(
      event?.id === args.event_id && event.status === "ongoing" && event.format === "round_robin" &&
      match?.id === args.match_id && match.event_id === args.event_id && match.stage === "round_robin" &&
      (match.status === "not_started" || match.status === "ongoing") &&
      match.scoring_mode !== "direct" && match.is_bye === false &&
      match.entry_a_id && match.entry_b_id,
    );
    return json({ eligible });
  } catch {
    return json({ error: "SERVICE_UNAVAILABLE" }, 503);
  }
});
