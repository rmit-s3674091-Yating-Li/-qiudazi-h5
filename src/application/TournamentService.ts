import type { DomainContext, Snapshot, Match, ScoreInput, Side, SetScore } from "../domain/types.js";
import { ensure } from "../domain/types.js";
import { validateRoster } from "../domain/EventRules.js";
import { roundRobin } from "../domain/RoundRobinEngine.js";
import { knockout } from "../domain/KnockoutEngine.js";
import { groupDraw, qualifierKnockout } from "../domain/GroupKnockoutEngine.js";
import { validateFinalScore, replay, addPoint, contextFor } from "../domain/ScoringEngine.js";
import { groupRankings } from "../domain/RankingEngine.js";
import { correctKnockoutPath } from "../domain/CascadeCorrectionEngine.js";
export interface TournamentCommand {
  type: "draw" | "unlock" | "cancel" | "start" | "finish" | "begin" | "point" | "undo" | "score";
  event_version: number; match_id?: string; match_version?: number; side?: Side; scores?: ScoreInput[]; confirmed?: boolean;
}
const played = (m: Match) => !m.is_bye && m.status !== "not_started";
function rows(m: Match, scores: ScoreInput[], s: Snapshot, c: DomainContext): SetScore[] { return scores.map((x, i) => ({ id:c.id(),match_id:m.id,set_no:i+1,a_games_or_points:x.a,b_games_or_points:x.b,a_tiebreak_points:x.ta??null,b_tiebreak_points:x.tb??null,winner_entry_id:x.a>x.b?m.entry_a_id!:m.entry_b_id! })); }
function refreshQualifiers(s: Snapshot, c: DomainContext, confirmed: boolean) {
  if (s.event.format !== "group_knockout") return;
  const groups=s.matches.filter(m=>m.stage==="group"), old=s.matches.filter(m=>m.stage==="knockout");
  const complete=groups.length>0&&groups.every(m=>m.status==="finished");
  const next=complete?qualifierKnockout(s.event,groupRankings(s),s.entries,c):[];
  const fingerprint=(ms:Match[])=>ms.filter(m=>m.round_no===1).sort((a,b)=>a.bracket_position!-b.bracket_position!).map(m=>[m.entry_a_id,m.entry_b_id]);
  if(JSON.stringify(fingerprint(old))===JSON.stringify(fingerprint(next)))return;
  ensure(!old.some(played),"QUALIFICATION_STARTED","更正会改变晋级或淘汰首轮对阵，但淘汰赛已开始，禁止此修改");
  if(old.length)ensure(confirmed,"CONFIRM_CASCADE","更正将重新生成晋级名单和未开始的淘汰签表，请确认级联影响");
  const oldIds=new Set(old.map(m=>m.id)); s.matches=s.matches.filter(m=>!oldIds.has(m.id)); s.set_scores=s.set_scores.filter(x=>!oldIds.has(x.match_id)); s.point_logs=s.point_logs.filter(x=>!oldIds.has(x.match_id)); s.matches.push(...next);
}
function autoFinishQuickSingleMatch(s: Snapshot, c: DomainContext) { const e=s.event;if(e.event_mode!=="quick"||e.status!=="ongoing")return;const real=s.matches.filter(m=>!m.is_bye);if(real.length!==1||real[0].status!=="finished")return;e.status="finished";e.finished_at=c.now(); }
export function applyCommand(original: Snapshot, actorId: string, command: TournamentCommand, c: DomainContext): Snapshot {
  ensure(original.event.owner_user_id===actorId,"FORBIDDEN","仅赛事创建者可以管理");
  ensure(original.event.version===command.event_version,"VERSION_CONFLICT","赛事已更新，请刷新后重试");
  ensure(original.event.status!=="finished","EVENT_FINISHED","赛事已结束，不能再修改结果");
  ensure(original.event.status!=="cancelled","EVENT_CANCELLED","赛事已取消，只能查看历史信息");
  const s:Snapshot=structuredClone(original),e=s.event;
  if(command.type==="cancel") {
    ensure(e.status==="signup"||e.status==="locked","CANCEL_STATE","只有尚未开始的赛事可以取消");
    ensure(!s.matches.some(played),"CANCEL_STARTED","已有真实比赛开始，不能按开赛前取消处理");
    ensure(command.confirmed,"CONFIRM_CANCEL","取消赛事后将进入只读终态，请确认");
    e.status="cancelled";
  } else if(command.type==="draw") {
    ensure(e.status==="locked","DRAW_STATE","请先锁定名单，再生成对阵");ensure(!s.matches.some(played),"DRAW_STARTED","已有比赛开始，不能重新生成");if(e.draw_generated)ensure(command.confirmed,"CONFIRM_CASCADE","重新生成会清空原签表，请确认");
    const entries=validateRoster(e,s.entries).sort((a,b)=>a.joined_at.localeCompare(b.joined_at)||a.id.localeCompare(b.id));s.matches=e.format==="round_robin"?roundRobin(e,entries,c):e.format==="knockout"?knockout(e,entries,c):[];
    if(e.format==="group_knockout"){const grouped=groupDraw(e,entries,c);s.matches=grouped.matches;s.entries=s.entries.map(en=>grouped.entries.find(x=>x.id===en.id)||en);}s.set_scores=[];s.point_logs=[];e.draw_generated=true;
  } else if(command.type==="unlock") {
    ensure(e.status==="locked","UNLOCK_STATE","仅尚未开始的锁定赛事可以解锁");ensure(!s.matches.some(played),"UNLOCK_STARTED","已有比赛开始，不能解锁");ensure(command.confirmed,"CONFIRM_CASCADE","解锁将清空签表，重新开放报名，请确认");s.matches=[];s.set_scores=[];s.point_logs=[];s.entries.forEach(en=>(en.group_no=null));e.status="signup";e.draw_generated=false;
  } else if(command.type==="start") { ensure(e.status==="locked"&&e.draw_generated&&s.matches.length,"START_STATE","请先锁定名单并生成对阵");e.status="ongoing";
  } else if(command.type==="finish") { ensure(e.status==="ongoing","FINISH_STATE","赛事尚未开始");ensure(s.matches.length&&s.matches.every(m=>m.status==="finished"),"UNFINISHED_MATCHES","仍有比赛未完成，不能结束赛事");if(e.format==="group_knockout")ensure(s.matches.some(m=>m.stage==="knockout"&&!m.next_match_id&&m.winner_entry_id),"NO_FINAL","淘汰赛决赛尚未完成");e.status="finished";e.finished_at=c.now();
  } else {
    ensure(e.status==="ongoing","SCORING_STATE","请先开始赛事");const m=s.matches.find(m=>m.id===command.match_id);ensure(m,"MATCH_NOT_FOUND","比赛不存在");ensure(!m.is_bye&&m.entry_a_id&&m.entry_b_id,"MATCH_NOT_READY","双方未就位或本场为轮空");ensure(m.version===command.match_version,"VERSION_CONFLICT","比赛已在其他页面更新，请刷新");const before={...m};
    if(command.type==="begin"){ensure(m.status==="not_started","MATCH_STARTED","比赛已开始");m.status="ongoing";}
    else if(command.type==="score"){const scores=command.scores||[],winner=validateFinalScore(e,scores);m.winner_entry_id=winner==="A"?m.entry_a_id:m.entry_b_id;m.status="finished";m.scoring_mode="direct";s.set_scores=s.set_scores.filter(x=>x.match_id!==m.id).concat(rows(m,scores,s,c));s.point_logs.filter(x=>x.match_id===m.id&&!x.voided_at).forEach(x=>(x.voided_at=c.now()));}
    else { ensure(m.scoring_mode!=="direct","DIRECT_SCORE_MODE","直接录分的比赛请通过比分更正修改");let logs=s.point_logs.filter(l=>l.match_id===m.id),live=replay(e,logs);if(command.type==="point"){ensure(m.status!=="finished","MATCH_FINISHED","比赛已结束");ensure(command.side==="A"||command.side==="B","SIDE","请选择得分方");s.point_logs.push({id:c.id(),match_id:m.id,set_no:live.sets.length+1,game_no:live.games[0]+live.games[1]+1,point_no:Math.max(0,...logs.map(l=>l.point_no))+1,winner_side:command.side,scoring_context:contextFor(e,live),created_at:c.now(),voided_at:null});live=addPoint(e,live,command.side);}else{const active=logs.filter(l=>!l.voided_at).sort((a,b)=>a.point_no-b.point_no);ensure(active.length,"NO_POINT","没有可撤销的分");active[active.length-1].voided_at=c.now();live=replay(e,logs);}m.scoring_mode="live";m.status=live.winner?"finished":live.pointCount?"ongoing":"not_started";m.winner_entry_id=live.winner==="A"?m.entry_a_id:live.winner==="B"?m.entry_b_id:null;s.set_scores=s.set_scores.filter(x=>x.match_id!==m.id).concat(rows(m,live.sets,s,c));}
    m.version++;if(m.stage==="knockout")correctKnockoutPath(s,before,m,!!command.confirmed);else refreshQualifiers(s,c,!!command.confirmed);autoFinishQuickSingleMatch(s,c);
  }
  e.version++;return s;
}
