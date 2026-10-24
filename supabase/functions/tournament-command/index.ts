import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { z } from "npm:zod@4.1.12";
import { applyCommand } from "../../../src/application/TournamentService.ts";
import { RuleError } from "../../../src/domain/types.ts";
import { isParticipantPointReceipt } from "../../../src/domain/ParticipantPointReceipt.ts";
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

// PostgreSQL integer versions are incremented in the same write transaction.
// The maximum int4 value cannot be incremented safely.
const MAX_INCREMENTABLE_PG_VERSION = 2147483646;
const pgVersion = z.number().int().min(1).max(MAX_INCREMENTABLE_PG_VERSION);

const schema = z.object({
  event_id: z.uuid(),
  type: z.enum(["draw", "unlock", "cancel", "withdraw", "exit", "start", "finish", "begin", "point", "undo", "score"]),
  event_version: pgVersion,
  match_id: z.uuid().optional(),
  match_version: pgVersion.optional(),
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
  if (cmd.type === "point") {
    if (!cmd.operation_id) ctx.addIssue({ code: "custom", path: ["operation_id"], message: "point 命令必须提供 operation_id" });
    if (!cmd.match_id || !cmd.match_version) ctx.addIssue({ code: "custom", path: ["match_id"], message: "point 命令必须提供 match_id 和 match_version" });
    if (!cmd.side) ctx.addIssue({ code: "custom", path: ["side"], message: "point 命令必须指定得分方" });
  }
  if (cmd.type === "exit" && (!cmd.match_id || !cmd.match_version)) {
    ctx.addIssue({ code: "custom", path: ["match_id"], message: "退赛/弃权命令必须提供 match_id 和 match_version" });
  }
});
type Command = z.infer<typeof schema>;

/** Normalize only validated point-command UUIDs before DB lookups and replay checks.
 * PostgreSQL UUID columns canonicalize case; JavaScript equality does not. */
function normalizePointCommandIds(cmd: Command): Command {
  if (cmd.type !== "point") return cmd;
  return {
    ...cmd,
    event_id: cmd.event_id.toLowerCase(),
    match_id: cmd.match_id?.toLowerCase(),
    operation_id: cmd.operation_id?.toLowerCase(),
  };
}

async function findPointOperation(client: ReturnType<typeof createClient>, cmd: Command, actorAuthUserId: string) {
  if (cmd.type !== "point" || !cmd.operation_id) return null;
  const { data, error } = await client.from("point_logs").select("id,match_id,winner_side,voided_at").eq("id", cmd.operation_id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // A voided operation remains reserved history, not a successful score replay.
  // Fail closed if the point status is absent from the database response.
  if (data.match_id !== cmd.match_id || data.winner_side !== cmd.side || data.voided_at !== null) return { conflict: true as const, snapshot: null };
  const { data: snapshot, error: snapshotError } = await client.rpc("get_event_snapshot_for_actor", { p_event_id: cmd.event_id, p_actor_auth_user_id: actorAuthUserId });
  if (snapshotError) throw snapshotError;
  const current = snapshot as Snapshot | null;
  if (
    !current ||
    current.event.id !== cmd.event_id ||
    !current.matches.some((match) => match.id === cmd.match_id && match.event_id === cmd.event_id) ||
    !current.point_logs.some(
      (log) => log.id === cmd.operation_id && log.match_id === cmd.match_id && log.winner_side === cmd.side && log.voided_at === null,
    )
  ) return { conflict: true as const, snapshot: null };
  return { conflict: false as const, snapshot: current };
}

async function tryParticipantRoundRobinPoint(
  client: ReturnType<typeof createClient>, cmd: Command,
  actorAuthUserId: string, actorProfileId: string,
): Promise<Response | null> {
  if (cmd.type !== "point" || !cmd.match_id || !cmd.match_version || !cmd.side || !cmd.operation_id) return null;
  // Fail closed before reading a service-role snapshot. A valid JWT/profile alone
  // does not grant access to another event's participant or scoring data.
  const { data: eventOwner, error: ownerError } = await client.from("events")
    .select("owner_user_id").eq("id", cmd.event_id).maybeSingle();
  if (ownerError) throw ownerError;
  if (!eventOwner) return json({ error: "赛事不存在", code: "EVENT_NOT_FOUND" }, 404);
  if (eventOwner.owner_user_id === actorProfileId) return null;

  // A committed final point may finish the match/event, so the live scoring
  // preflight can legitimately return false on replay. Inspect operation identity
  // first; the atomic RPC remains the final actor-binding and membership gate.
  const { data: prior, error: priorError } = await client.from("point_logs")
    .select("id,match_id,winner_side").eq("id", cmd.operation_id).maybeSingle();
  if (priorError) throw priorError;
  if (prior && (prior.match_id !== cmd.match_id || prior.winner_side !== cmd.side)) {
    return json({ error: "operation_id 已用于另一条得分操作", code: "OPERATION_CONFLICT" }, 409);
  }

  // Fresh points must pass the active-match preflight. Replays instead rely on
  // the locked RPC, which rechecks current membership and the bound JWT actor.
  if (!prior) {
    const { data: eligible, error: eligibilityError } = await client.rpc("v8_active_match_participant", {
      p_event_id: cmd.event_id, p_match_id: cmd.match_id, p_actor_auth_user_id: actorAuthUserId,
    });
    if (eligibilityError) throw eligibilityError;
    if (eligible !== true) return json({ error: "当前账号不是该场比赛的实际参赛者", code: "NOT_MATCH_PARTICIPANT" }, 403);
  }

  const { data, error } = await client.rpc("get_event_snapshot", { p_event_id: cmd.event_id });
  if (error) throw error;
  const current = data as Snapshot;

  const match = current.matches.find((item) => item.id === cmd.match_id && item.event_id === cmd.event_id);
  if (!match) return json({ error: "比赛不存在", code: "MATCH_NOT_FOUND" }, 404);
  if (current.event.format !== "round_robin" || match.stage !== "round_robin") {
    return json({ error: "当前赛制尚未开放参赛者逐分记分", code: "PARTICIPANT_POINT_NOT_ALLOWED" }, 403);
  }

  let firstId = true;
  const next = prior ? current : applyCommand(current, current.event.owner_user_id, cmd, {
    id: () => {
      if (firstId) { firstId = false; return cmd.operation_id!; }
      return crypto.randomUUID();
    },
    now: () => new Date().toISOString(),
  });
  const result = await client.rpc("v8_commit_participant_round_robin_point", {
    p_event_id: cmd.event_id,
    p_match_id: cmd.match_id,
    p_actor_auth_user_id: actorAuthUserId,
    p_expected_event_version: cmd.event_version,
    p_expected_match_version: cmd.match_version,
    p_operation_id: cmd.operation_id,
    p_side: cmd.side,
    p_snapshot: next,
  });
  if (result.error) throw result.error;
  if (!isParticipantPointReceipt(result.data, {
    eventId: cmd.event_id,
    matchId: cmd.match_id,
    operationId: cmd.operation_id,
    side: cmd.side,
    expectedEventVersion: cmd.event_version,
    expectedMatchVersion: cmd.match_version,
  })) {
    return json({ error: "PARTICIPANT_POINT_RECEIPT_INVALID", code: "PARTICIPANT_POINT_RECEIPT_INVALID" }, 503);
  }
  return json(result.data);
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
  const cmd = normalizePointCommandIds(parsed.data);
  try {
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError) {
      // An Auth outage or rate limit does not prove that the JWT was revoked.
      // Never access the service-role profile or scoring RPC on failed verification.
      const status = authError.status;
      if (status === 400 || status === 401 || status === 403 || status === 422) {
        return json({ error: "身份已失效，请刷新页面恢复登录", code: "AUTH_REQUIRED" }, 401);
      }
      return json({ error: "身份验证服务暂不可用，请稍后重试", code: "AUTH_CHECK_UNAVAILABLE" }, 503);
    }
    if (!user?.id) return json({ error: "身份已失效，请刷新页面恢复登录", code: "AUTH_REQUIRED" }, 401);
    const { data: profiles, error: profileError } = await client.rpc("resolve_profile_for_auth_user", { p_auth_user_id: user.id });
    if (profileError) throw profileError;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    if (!profile || profile.profile_status !== "completed") return json({ error: "PROFILE_REQUIRED" }, 403);
    const participantPoint = await tryParticipantRoundRobinPoint(client, cmd, user.id, profile.id);
    if (participantPoint) return participantPoint;
    const existing = await findPointOperation(client, cmd, user.id);
    if (existing?.conflict) return json({ error: "operation_id 已用于另一条得分操作", code: "OPERATION_CONFLICT" }, 409);
    if (existing?.snapshot) return json(existing.snapshot);

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

    if (cmd.type === "exit") {
      if (!cmd.confirmed) return json({ error: "退赛/弃权前需要确认", code: "CONFIRM_REQUIRED" }, 409);
      const result = await client.rpc("resolve_quick_match_exit", {
        p_event_id: cmd.event_id,
        p_match_id: cmd.match_id,
        p_actor_auth_user_id: user.id,
        p_expected_match_version: cmd.match_version,
      });
      if (result.error) throw result.error;
      return json(result.data);
    }

    const { data: snapshot, error } = await client.rpc("get_event_snapshot_for_actor", { p_event_id: cmd.event_id, p_actor_auth_user_id: user.id });
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
        const recovered = await findPointOperation(client, cmd, user.id);
        if (recovered?.conflict) return json({ error: "operation_id 已用于另一条得分操作", code: "OPERATION_CONFLICT" }, 409);
        if (recovered?.snapshot) return json(recovered.snapshot);
      }
      throw result.error;
    }
    return json(result.data);
  } catch (error) {
    if (error instanceof RuleError) return json({ error: error.message, code: error.code }, error.code === "FORBIDDEN" ? 403 : 409);
    const message = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
    if (message.includes("OPERATION_CONFLICT")) return json({ error: "operation_id 已用于另一条得分操作", code: "OPERATION_CONFLICT" }, 409);
    if (message.includes("PARTICIPANT_POINT_NOT_ALLOWED")) return json({ error: "当前比赛不允许参赛者逐分记分", code: "PARTICIPANT_POINT_NOT_ALLOWED" }, 403);
    if (message.includes("INVALID_POINT_SNAPSHOT")) return json({ error: "比分状态已变化，请刷新后重试", code: "POINT_SNAPSHOT_CONFLICT" }, 409);
    if (message.includes("VERSION_CONFLICT")) return json({ error: "数据已更新，请刷新重试", code: "VERSION_CONFLICT" }, 409);
    if (message.includes("EVENT_NOT_FOUND")) return json({ error: "赛事不存在" }, 404);
    if (message.includes("MATCH_NOT_FOUND")) return json({ error: "比赛不存在", code: "MATCH_NOT_FOUND" }, 404);
    if (message.includes("OWNER_MUST_CANCEL")) return json({ error: "创建人请使用取消比赛", code: "OWNER_MUST_CANCEL" }, 409);
    if (message.includes("NOT_MATCH_PARTICIPANT")) return json({ error: "当前账号不是该场比赛的实际参赛者", code: "NOT_MATCH_PARTICIPANT" }, 403);
    if (message.includes("NOT_PARTICIPANT")) return json({ error: "当前账号不是该赛事的实际参赛者", code: "NOT_PARTICIPANT" }, 403);
    if (message.includes("MATCH_EXIT_CLOSED")) return json({ error: "当前赛事状态不可退赛或弃权", code: "MATCH_EXIT_CLOSED" }, 409);
    if (message.includes("MATCH_ALREADY_FINISHED")) return json({ error: "该场比赛已经结束", code: "MATCH_ALREADY_FINISHED" }, 409);
    if (message.includes("MATCH_EXIT_INVALID")) return json({ error: "该场比赛不能执行退赛或弃权", code: "MATCH_EXIT_INVALID" }, 409);
    if (message.includes("DOWNSTREAM_MATCH_STARTED")) return json({ error: "后续比赛已经开始，不能改写本场结果", code: "DOWNSTREAM_MATCH_STARTED" }, 409);
    if (message.includes("WITHDRAW_CLOSED")) return json({ error: "比赛已开始或当前状态不可退出", code: "WITHDRAW_CLOSED" }, 409);
    if (message.includes("QUICK_ONLY")) return json({ error: "该退出入口仅适用于 Quick 比赛", code: "QUICK_ONLY" }, 409);
    console.error("Tournament command failed", error);
    return json({ error: "保存失败，未提交的事务已回滚，请刷新重试" }, 500);
  }
});
