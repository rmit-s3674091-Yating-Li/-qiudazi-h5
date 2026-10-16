/** Strict browser contract for the dedicated, read-only score anomaly Edge route. */
export type ScoreExceptionCursor={created_at:string;id:string};
export type ScoreExceptionCode="FINISHED_WITHOUT_WINNER"|"UNFINISHED_WITH_WINNER"|"WINNER_NOT_IN_MATCH"|"DIRECT_WITH_ACTIVE_POINTS";
export type ScoreExceptionRow={match_id:string;event_id:string;stage:"round_robin"|"group"|"knockout";round_no:number;status:"not_started"|"ongoing"|"finished";scoring_mode:"direct"|"live"|null;version:number;anomaly_code:ScoreExceptionCode;created_at:string};
export type ScoreExceptionPage={items:ScoreExceptionRow[];nextCursor:ScoreExceptionCursor|null};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, zonedTime=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const codes:readonly ScoreExceptionCode[]=["FINISHED_WITHOUT_WINNER","UNFINISHED_WITH_WINNER","WINNER_NOT_IN_MATCH","DIRECT_WITH_ACTIVE_POINTS"];
const fields=["match_id","event_id","stage","round_no","status","scoring_mode","version","anomaly_code","created_at"] as const;
const isObject=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v),isUuid=(v:unknown):v is string=>typeof v==="string"&&uuid.test(v),isTime=(v:unknown):v is string=>typeof v==="string"&&zonedTime.test(v)&&Number.isFinite(Date.parse(v)),oneOf=(v:unknown,c:readonly string[]):v is string=>typeof v==="string"&&c.includes(v),exact=(v:Record<string,unknown>,k:readonly string[])=>Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
export function parseScoreExceptionPage(value:unknown,eventId:string,pageSize=20):ScoreExceptionPage|null{if(!isUuid(eventId)||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50||!isObject(value)||!exact(value,["items","next_cursor"])||!Array.isArray(value.items)||value.items.length>pageSize)return null;const items:ScoreExceptionRow[]=[],seen=new Set<string>();for(const row of value.items){if(!isObject(row)||!exact(row,fields)||!isUuid(row.match_id)||row.event_id!==eventId||seen.has(row.match_id)||!oneOf(row.stage,["round_robin","group","knockout"])||!Number.isSafeInteger(row.round_no)||(row.round_no as number)<1||!oneOf(row.status,["not_started","ongoing","finished"])||!(row.scoring_mode===null||oneOf(row.scoring_mode,["direct","live"]))||!Number.isSafeInteger(row.version)||(row.version as number)<1||!oneOf(row.anomaly_code,codes)||!isTime(row.created_at))return null;seen.add(row.match_id);items.push(row as ScoreExceptionRow);}if(value.next_cursor===null)return{items,nextCursor:null};const c=value.next_cursor;if(!isObject(c)||!exact(c,["created_at","id"])||!isTime(c.created_at)||!isUuid(c.id)||!items.length||c.id!==items.at(-1)!.match_id||c.created_at!==items.at(-1)!.created_at)return null;return{items,nextCursor:{created_at:c.created_at,id:c.id}};}
/** PostgreSQL orders this directory by (created_at DESC, match_id DESC).
 * Keep microseconds: Date.parse alone truncates PostgreSQL timestamps to milliseconds.
 */
function microsecondTime(value: string): bigint {
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? "";
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.slice(3, 6).padEnd(3, "0"));
}

function compareKeys(a: ScoreExceptionCursor, b: ScoreExceptionCursor): number {
  const timeA = microsecondTime(a.created_at);
  const timeB = microsecondTime(b.created_at);
  if (timeA !== timeB) return timeA > timeB ? 1 : -1;
  const idA = a.id.toLowerCase();
  const idB = b.id.toLowerCase();
  return idA === idB ? 0 : idA > idB ? 1 : -1;
}

/** Fail closed on out-of-order, replayed, or overlapping pages rather than silently deduplicating. */
export function validScoreExceptionPageBoundary(
  page: ScoreExceptionPage,
  before: ScoreExceptionCursor | null,
  previousIds: ReadonlySet<string> = new Set<string>(),
): boolean {
  let previous = before;
  for (const row of page.items) {
    if (previousIds.has(row.match_id.toLowerCase())) return false;
    const current = { created_at: row.created_at, id: row.match_id };
    if (previous && compareKeys(current, previous) >= 0) return false;
    previous = current;
  }
  if (page.nextCursor && (!previous || compareKeys(page.nextCursor, previous) !== 0)) return false;
  return true;
}

export const SCORE_EXCEPTION_LABELS:Record<ScoreExceptionCode,{zh:string;en:string}>={FINISHED_WITHOUT_WINNER:{zh:"比赛已结束但缺少获胜方",en:"Finished match has no winner"},UNFINISHED_WITH_WINNER:{zh:"比赛未结束但已有获胜方",en:"Unfinished match has a winner"},WINNER_NOT_IN_MATCH:{zh:"获胜方不属于本场对阵",en:"Winner is not a match entry"},DIRECT_WITH_ACTIVE_POINTS:{zh:"直接录分与有效逐分记录并存",en:"Direct scoring has active point logs"}};
