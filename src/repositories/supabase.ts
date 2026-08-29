import { createClient } from "@supabase/supabase-js";
import type {
  Event,
  EventConfig,
  Player,
  Profile,
  Snapshot,
} from "../domain/types";
import type { Filters, TournamentRepository } from "./contracts";
const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://rtmjzmgrhifjzxaliltm.supabase.co";
const key =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "sb_publishable_vM47k7tVER77x3bpGSkDdw_dowVImzn";
export const configured = !!(url && key);
export const supabase = configured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
function client() {
  if (!supabase)
    throw new Error(
      "请先配置Supabase项目。当前不会使用本地数据替代在线数据库。",
    );
  return supabase;
}
const messages: Record<string, string> = {
  PROFILE_REQUIRED: "请先完成我的打球档案",
  DUPLICATE_PLAYER: "该参赛者已在本赛事名单中，不能重复报名",
  ENTRY_SIZE: "请选择正确的参赛人数",
  PLAYER_FORBIDDEN: "只能选择我的打球档案或已录入的临时球搭子",
  SELF_REQUIRED: "自主报名必须包含我的打球档案",
  SIGNUP_DISABLED: "此赛事未开放自主报名",
  WAITLIST_FULL: "正式和候补名额均已满",
  TOO_FEW_ENTRIES: "至少需要2个正式参赛单元",
  GROUP_SIZE: "每组至少2个参赛单元，晋级人数须少于该组人数",
  AUTH_REQUIRED: "请先创建我的打球档案",
  FORBIDDEN: "仅创建者可执行此操作",
  VERSION_CONFLICT: "数据已被其他页面更新，请刷新后重试",
  NICKNAME_REQUIRED: "请填写1–40字昵称",
  ROSTER_LOCKED: "参赛名单已锁定",
  PLAYER_HAS_HISTORY: "已参与赛事的临时球搭子不能删除",
  SELF_PLAYER_PROTECTED: "我的打球档案不能删除",
  EVENT_HAS_HISTORY: "有参赛历史的赛事不能删除",
  EVENT_NOT_FOUND: "赛事不存在",
  LIMIT_BELOW_ROSTER: "名额不能低于正式参赛数",
  ENTRY_TYPE_LOCKED: "已有报名，不能切换单打或双打",
  INVALID_AVATAR: "头像文件不可用，请重新上传",
  INVITE_NOT_FOUND: "这个邀请不存在或已经失效",
  INVITE_CLOSED: "这个邀请已经失效，请让对方重新发送",
  SELF_INVITE: "不能接受自己发出的邀请",
  PLAYER_ALREADY_CLAIMED: "这份打球记录已经被关联",
  SELF_PLAYER_REQUIRED: "没有找到你的打球档案，请重新进入后再试",
  PLAYER_CLAIM_CONFLICT: "你和这份历史记录在同一赛事里都有参赛记录，暂时无法自动合并",
};
export function explainError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "操作失败，请重试";
  const code = Object.keys(messages).find((k) => message.includes(k));
  return code ? messages[code] : message;
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(explainError(error));
  return data as T;
}
export const repository: TournamentRepository = {
  profile: () => rpc<Profile>("ensure_profile"),
  completeProfile: (name, avatar) =>
    rpc<Profile>("complete_profile", { p_name: name, p_avatar_path: avatar }),
  async players() {
    const { data, error } = await client()
      .from("players")
      .select("*")
      .order("created_at");
    if (error) throw error;
    return data as Player[];
  },
  savePlayer: (id, name, avatar, version) =>
    rpc<Player>("save_player", {
      p_id: id,
      p_name: name,
      p_avatar_path: avatar,
      p_version: version ?? null,
    }),
  deletePlayer: (id) => rpc<void>("delete_player", { p_id: id }),
  events: (filters: Filters = {}) =>
    rpc<Event[]>("list_events", { p_mine: !!filters.mine, p_filters: filters }),
  event: (id) => rpc<Snapshot>("get_event_snapshot", { p_event_id: id }),
  saveEvent: (id, config, version) =>
    rpc<Event>("save_event", {
      p_id: id,
      p_config: config,
      p_version: version ?? null,
    }),
  deleteEvent: (id, version) =>
    rpc<void>("delete_event", { p_id: id, p_version: version }),
};
export function assetUrl(path: string | null | undefined, bucket = "avatars") {
  if (!path || !supabase) return undefined;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
export async function uploadAsset(blob: Blob, bucket: string, path: string) {
  const { error } = await client()
    .storage.from(bucket)
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error(explainError(error));
  return path;
}
export async function command(
  eventId: string,
  action: Record<string, unknown>,
) {
  const c = client();
  const { data: sessionData } = await c.auth.getSession();
  if (!sessionData.session) throw new Error("请先创建我的打球档案");
  const { data, error } = await c.functions.invoke("tournament-command", {
    body: { event_id: eventId, ...action },
  });
  if (error) {
    let message = error.message;
    try {
      const context = (error as { context?: Response }).context;
      if (context) {
        const body = await context.clone().json();
        if (body?.error) message = body.error;
      }
    } catch {}
    throw new Error(explainError(message));
  }
  return data as Snapshot;
}
