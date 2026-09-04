import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { z } from "npm:zod@4.1.12";
import { applyCommand } from "../../../src/application/TournamentService.ts";
import { RuleError } from "../../../src/domain/types.ts";
import type { Snapshot } from "../../../src/domain/types.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const schema = z.object({
  event_id: z.uuid(),
  type: z.enum(["draw", "unlock", "cancel", "withdraw", "start", "finish", "begin", "point", "undo", "score"]),
  event_version: z.number().int().positive(),
  match_id: z.uuid().optional(),
  match_version: z.number().int().positive().optional(),
  side: z.enum(["A", "B"]).optional(),
  operation_id: z.uuid().optional(),
  scores: z.array(z.object({
    a: z.number().int().min(0).max(100000),
    b: z.number().int().min(0).max(100000),
    ta: z.number().int().min(0).max(100000).nullable().optional(),
    tb: z.number().int().min(0).max(100000).nullable().optional(),
  }).strict()).max(5).optional(),
  confirmed: z.boolean().optional(),
}).strict().superRefine((cmd, ctx) => {
  if (cmd.type === "point" && !cmd.operation_id) {
    ctx.addIssue({ code: "custom", path: ["operation_id"], message: "point 命令必须提供 operation_id" });
  }
});
type Command = z.infer<typeof schema>;

async function findPointOperation(client: ReturnType<typeof createClient>, cmd: Command) {
  if (cmd.type !== "point" || !cmd.operation_id) return null;
  const { data, error } = await client.from("point_logs").select("id,match_id,winner_side").eq("id", cmd.operation_id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.match_id !== cmd.match_id || data.winner_side !== cmd.side) return { conflict: true as const, snapshot: null };
  const { data: snapshot, error: snapshotError } = await client.rpc("get_event_snapshot", { p_event_id: cmd.event_id });
  if (snapshotError) throw snapshotError;
  return { conflict: false as const, snapshot: snapshot as Snapshot };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "仅支持POST" }, 405);
  const token = (req.headers.get("Authorization") || "").match(/^Bearer (.+)$/)?.[1];
  if (!token) return json({ error: "AUTH_REQUIRED" }, 401);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "JSON格式不正确" }, 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "命令格式不正确" }, 400);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Supabase服务配置缺失" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const cmd = parsed.data;
  try {
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return json({ error: "身份已失效，请刷新页面恢复登录" }, 401);
    const { data: profiles, error: profileError } = await client.rpc("resolve_profile_for_auth_user", { p_auth_user_id: user.id });
    if (profileError) throw profileError;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    if (!profile || profile.profile_status !== "completed") return json({ error: "PROFILE_REQUIRED" }, 403);
    const existing = await findPointOperation(client, cmd);
    if (existing?.conflict) return json({ error: "operation_id 已用于另一条得分操作", code: "OPERATION_CONFLICT" }, 409);
    if (existing?.snapshot) return json(existing.snapshot);

    // Participant withdrawal has a deliberately narrow transaction boundary. Ordinary
    // tournament mutations remain owner-only in commit_tournament.
    if (cmd.type === "withdraw") {
      if (!cmd.confirmed) return json({ error: "退出比赛前需要确认", code: "CONFIRM_REQUIRED" }, 409);
      const result = await client.rpc("withdraw_quick_event", {
        p_event_id: cmd.event_id,
        p_actor_auth_user_id: user.id,
        p_expected_version: cmd.event_version,
      });
      if (result.error) throw result.error;
      return json(result.data);
    }

    const { data: snapshot, error } = await client.rpc("get_event_snapshot", { p_event_id: cmd.event_id });
    if (error) throw error;
    let firstId = true;
    const next = applyCommand(snapshot as Snapshot, profile.id, cmd, {
      id: () => {
        if (cmd.type === "point" && cmd.operation_id && firstId) { firstId = false; return cmd.operation_id; }
        return crypto.randomUUID();
      },
      now: () => new Date().toISOString(),
    });
    const result = await client.rpc("commit_tournament", { p_event_id: cmd.event_id, p_actor_auth_user_id: user.id, p_expected_version: cmd.event_version, p_snapshot: next });
    if (result.error) {
      if (cmd.type === "point" && cmd.operation_id && String(result.error.message || "").includes("VERSION_CONFLICT")) {
        const recovered = await findPointOperation(client, cmd);
        if (recovered?.conflict) return json({ error: "operation_id 已用于另一条得分操作", code: "OPERATION_CONFLICT" }, 409);
        if (recovered?.snapshot) return json(recovered.snapshot);
      }
      throw result.error;
    }
    return json(result.data);
  } catch (error) {
    if (error instanceof RuleError) return json({ error: error.message, code: error.code }, error.code === "FORBIDDEN" ? 403 : 409);
    const message = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
    if (message.includes("VERSION_CONFLICT")) return json({ error: "数据已更新，请刷新重试", code: "VERSION_CONFLICT" }, 409);
    if (message.includes("EVENT_NOT_FOUND")) return json({ error: "赛事不存在" }, 404);
    if (message.includes("OWNER_MUST_CANCEL")) return json({ error: "创建人请使用取消比赛", code: "OWNER_MUST_CANCEL" }, 409);
    if (message.includes("NOT_PARTICIPANT")) return json({ error: "当前账号不是该赛事的实际参赛者", code: "NOT_PARTICIPANT" }, 403);
    if (message.includes("WITHDRAW_CLOSED")) return json({ error: "比赛已开始或当前状态不可退出", code: "WITHDRAW_CLOSED" }, 409);
    if (message.includes("QUICK_ONLY")) return json({ error: "该退出入口仅适用于 Quick 比赛", code: "QUICK_ONLY" }, 409);
    console.error("Tournament command failed", error);
    return json({ error: "保存失败，未提交的事务已回滚，请刷新重试" }, 500);
  }
});