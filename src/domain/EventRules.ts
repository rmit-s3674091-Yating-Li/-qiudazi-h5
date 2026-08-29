import type { EventConfig, Entry } from "./types.js";
import { ensure } from "./types.js";
export function validateEvent(config: EventConfig): EventConfig {
  const e = { ...config, name: config.name.trim(), city: config.city?.trim() || null, venue: config.venue?.trim() || null };
  ensure(e.name.length > 0 && e.name.length <= 80,"NAME_REQUIRED","请填写赛事名称（80字以内）");
  ensure(["public", "private"].includes(e.visibility),"VISIBILITY","请选择公开赛事或私有赛事");
  ensure(["singles", "doubles"].includes(e.match_type),"MATCH_TYPE","请选择单打或双打");
  ensure(["round_robin", "knockout", "group_knockout"].includes(e.format),"FORMAT","请选择赛制");
  ensure([1, 3, 5].includes(e.best_of), "BEST_OF", "盘数必须为1、3或5");
  ensure(["games_4","games_6","tiebreak_7","points_11","points_15","custom_games"].includes(e.scoring_type),"SCORING","请选择计分方式");
  ensure(!!e.city && e.city.length <= 30, "CITY_REQUIRED", "请填写城市（30字以内）");
  if (e.venue) ensure(e.venue.length <= 120, "VENUE", "比赛场地请控制在120字以内");
  if (e.scoring_type === "games_4") ensure([3, 4].includes(e.tiebreak_trigger!),"TIEBREAK","4局制请选择3:3或4:4抢七");
  if (e.scoring_type === "games_6") ensure([5, 6].includes(e.tiebreak_trigger!),"TIEBREAK","6局制请选择5:5或6:6抢七");
  if (e.scoring_type === "custom_games") ensure(Number.isInteger(e.custom_games_target) && e.custom_games_target! >= 1 && e.custom_games_target! <= 100,"CUSTOM_GAMES","自定义局数须为1–100的整数");
  if (e.entry_limit !== null) ensure(Number.isInteger(e.entry_limit) && e.entry_limit >= 2 && e.entry_limit <= 128,"ENTRY_LIMIT","在线测试版名额须为2–128，或留空");
  if (e.event_date) ensure(/^\d{4}-\d{2}-\d{2}$/.test(e.event_date) && !Number.isNaN(Date.parse(e.event_date)) && new Date(e.event_date).toISOString().slice(0, 10) === e.event_date,"DATE","日期不正确");
  if (e.format === "group_knockout") ensure(Number.isInteger(e.group_count) && e.group_count! >= 1 && Number.isInteger(e.qualifiers_per_group) && e.qualifiers_per_group! >= 1 && e.group_count! * e.qualifiers_per_group! >= 2,"GROUP_CONFIG","请设置有效组数和晋级数，总晋级至少2个");
  for (const n of [e.venue_fee_total,e.ball_fee_total,e.other_fee_total,e.fixed_fee_per_entry]) if (n !== null) ensure(Number.isFinite(n) && n >= 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6,"FEE","费用须为非负金额，最多两位小数");
  if (e.fee_type === "aa") ensure((e.venue_fee_total || 0) + (e.ball_fee_total || 0) + (e.other_fee_total || 0) > 0,"FEE","AA总费用须大于0");
  if (e.fee_type === "fixed") ensure(e.fixed_fee_per_entry !== null && e.fixed_fee_per_entry > 0,"FEE","固定费用须大于0");
  e.link_signup_enabled = true;
  if (e.format !== "group_knockout") { e.group_count = null; e.qualifiers_per_group = null; }
  if (e.scoring_type !== "custom_games") e.custom_games_target = null;
  if (!["games_4", "games_6"].includes(e.scoring_type)) e.tiebreak_trigger = null;
  return e;
}
export function validateRoster(event: EventConfig, entries: Entry[]) {
  const active = entries.filter((e) => e.status === "confirmed");
  ensure(active.length >= 2, "TOO_FEW_ENTRIES", "至少需要2个正式参赛单元");
  const players = new Set<string>();
  for (const entry of active) {
    ensure(entry.players.length === (event.match_type === "doubles" ? 2 : 1),"ENTRY_SIZE","队伍人数不完整");
    for (const p of entry.players) { ensure(!players.has(p.id), "DUPLICATE_PLAYER", "同一参赛者不能重复参赛"); players.add(p.id); }
  }
  if (event.format === "group_knockout") {
    const smallest = Math.floor(active.length / event.group_count!);
    ensure(smallest >= 2 && event.qualifiers_per_group! < smallest,"GROUP_SIZE","每组至少2个参赛单元，晋级数须少于该组人数");
  }
  return active;
}
