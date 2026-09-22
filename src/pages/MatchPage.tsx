import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import type { ScoreInput, Side, Snapshot } from "../domain/types";
import { addPoint,replay,displayPoints,contextFor,currentSetNumber,currentGameNumber,setWinner,validateFinalScore,tieTrigger,isPointSet } from "../domain/ScoringEngine";
import { command, repository, explainError } from "../repositories/supabase";
import { invalidateQueryPrefix, useQuery } from "../hooks/useQuery";
import { Header,ErrorNotice,Loading,entryName,labelFor,Confirm } from "../components/UI";
import { applyCommand } from "../application/TournamentService";
import { useLanguage } from "../i18n";

type PendingPoint={side:Side;operationId:string};

export function MatchPage({mode="detail"}:{mode?:"detail"|"direct"|"live"}){
  const{id,matchId}=useParams(),navigate=useNavigate();
  const{language,t}=useLanguage(),en=language==="en";
  const q=useQuery("match-"+id+"-"+matchId,()=>repository.event(id!),10000);
  const[confirmText,setConfirmText]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<(()=>void)|null>(null),[inputs,setInputs]=useState<{a:string;b:string;ta:string;tb:string}[]>([]),[formVersion,setFormVersion]=useState<number>(),[editing,setEditing]=useState(false),[optimisticPoints,setOptimisticPoints]=useState<PendingPoint[]>([]);
  const loaded=useRef(""),pointQueue=useRef<PendingPoint[]>([]),pointFlush=useRef(false),latestSnapshot=useRef<Snapshot|null>(null);
  const s=q.data,m=s?.matches.find(x=>x.id===matchId);

  useEffect(()=>{if(s)latestSnapshot.current=s},[s]);
  useEffect(()=>{if(!s||!m)return;const key=m.id+mode;const shouldInitialize=loaded.current!==key;const shouldResyncDirect=mode==="direct"&&!editing&&formVersion!==undefined&&m.version!==formVersion;if(!shouldInitialize&&!shouldResyncDirect)return;loaded.current=key;const sets=s.set_scores.filter(x=>x.match_id===m.id).sort((a,b)=>a.set_no-b.set_no);setInputs(Array.from({length:s.event.best_of},(_,i)=>({a:sets[i]?String(sets[i].a_games_or_points):"",b:sets[i]?String(sets[i].b_games_or_points):"",ta:sets[i]?.a_tiebreak_points!=null?String(sets[i].a_tiebreak_points):"",tb:sets[i]?.b_tiebreak_points!=null?String(sets[i].b_tiebreak_points):""})));setFormVersion(m.version);if(shouldInitialize)setEditing(false)},[s,m,mode,editing,formVersion]);

  function invalidateEventReads(){invalidateQueryPrefix("event-");invalidateQueryPrefix("events");invalidateQueryPrefix("my-events")}

  async function send(type:string,extra:Record<string,unknown>={},confirmed=false){
    if(!s||!m)return;
    setBusy(true);setError("");
    try{
      const next=await command(s.event.id,{type,event_version:s.event.version,match_id:m.id,match_version:type==="score"?formVersion:m.version,...extra,confirmed});
      latestSnapshot.current=next;q.replace(next);invalidateEventReads();setConfirm(null);
      if(type==="score")navigate("/events/"+id+"/matches/"+matchId,{replace:true});
    }catch(e){setError(explainError(e))}finally{setBusy(false)}
  }

  async function flushPointQueue(){
    if(pointFlush.current)return;
    pointFlush.current=true;setError("");
    try{
      while(pointQueue.current.length){
        let current=latestSnapshot.current,currentMatch=current?.matches.find(x=>x.id===matchId);
        if(!current||!currentMatch)throw new Error(en?"The latest match state is unavailable. Refresh and try again.":"最新比赛状态不可用，请刷新后重试。");
        const pending=pointQueue.current[0];
        let next:Snapshot;
        try{
          next=await command(current.event.id,{type:"point",event_version:current.event.version,match_id:currentMatch.id,match_version:currentMatch.version,side:pending.side,operation_id:pending.operationId});
        }catch(firstError){
          const reconciled=await q.refresh();
          latestSnapshot.current=reconciled;
          const committed=reconciled.point_logs.some(log=>log.id===pending.operationId&&log.match_id===matchId&&log.winner_side===pending.side);
          if(committed){next=reconciled}
          else{
            current=reconciled;currentMatch=current.matches.find(x=>x.id===matchId);
            if(!currentMatch)throw firstError;
            next=await command(current.event.id,{type:"point",event_version:current.event.version,match_id:currentMatch.id,match_version:currentMatch.version,side:pending.side,operation_id:pending.operationId});
          }
        }
        latestSnapshot.current=next;
        pointQueue.current.shift();
        setOptimisticPoints([...pointQueue.current]);
        q.replace(next);invalidateEventReads();
      }
    }catch(e){
      setOptimisticPoints([...pointQueue.current]);const detail=explainError(e);setError(en?`This point was not synced. It is kept for a safe retry and will not be counted twice.${detail?` ${detail}`:""}`:`这一分尚未同步成功，系统已保留为安全重试，不会重复记分。${detail?` ${detail}`:""}`);
    }finally{pointFlush.current=false}
  }

  function enqueuePoint(side:Side){
    const current=latestSnapshot.current,currentMatch=current?.matches.find(x=>x.id===matchId);
    if(!current||!currentMatch||busy||currentMatch.scoring_mode==="direct"||currentMatch.status==="finished")return;
    let predicted=replay(current.event,current.point_logs.filter(l=>l.match_id===currentMatch.id));
    try{for(const queued of pointQueue.current){if(predicted.winner)return;predicted=addPoint(current.event,predicted,queued.side)}if(predicted.winner)return;addPoint(current.event,predicted,side)}catch{return}
    pointQueue.current.push({side,operationId:crypto.randomUUID()});setOptimisticPoints([...pointQueue.current]);void flushPointQueue();
  }

  if(!s)return <><Header title={t("match")}/><main className="page"><ErrorNotice message={q.error} retry={q.refresh}/>{q.loading&&<Loading/>}</main></>;
  if(!m)return <><Header title={t("matchAdjusted")}/><main className="page"><p>{t("matchAdjustedHint")}</p><Link className="button" to={"/events/"+id}>{t("viewEvent")}</Link></main></>;

  const e=s.event,owner=s.viewer_role==="owner",canScore=owner&&e.status==="ongoing"&&!m.is_bye&&!!m.entry_a_id&&!!m.entry_b_id,aEntry=s.entries.find(x=>x.id===m.entry_a_id),bEntry=s.entries.find(x=>x.id===m.entry_b_id),a=aEntry?entryName(aEntry):(en?"TBD":"待晋级"),b=bEntry?entryName(bEntry):(en?"TBD":"待晋级");
  const logs=s.point_logs.filter(l=>l.match_id===m.id),serverLive=replay(e,logs);
  let live=serverLive;
  try{for(const pending of optimisticPoints){if(live.winner)break;live=addPoint(e,live,pending.side)}}catch{live=serverLive}
  const display=displayPoints(e,live),scoringContext=contextFor(e,live),liveLabel=!en?display.label:live.winner?t("matchEnded"):scoringContext==="tiebreak"?t("tiebreak"):scoringContext==="point_set"?"Point race":live.points[0]>=3&&live.points[1]>=3?(live.points[0]===live.points[1]?"Deuce":"Advantage"):"Current point",sets=s.set_scores.filter(x=>x.match_id===m.id).sort((a,b)=>a.set_no-b.set_no),base=`/events/${id}/matches/${matchId}`;
  const scores:ScoreInput[]=inputs.filter(x=>x.a!==""||x.b!=="").map(x=>({a:x.a===""?NaN:Number(x.a),b:x.b===""?NaN:Number(x.b),ta:x.ta===""?null:Number(x.ta),tb:x.tb===""?null:Number(x.tb)}));
  let validation="";try{const last=inputs.reduce((n,x,i)=>x.a!==""||x.b!==""?i:n,-1);if(inputs.slice(0,last+1).some(x=>x.a===""||x.b===""))throw new Error(t("scoreSequenceError"));validateFinalScore(e,scores)}catch(err){validation=explainError(err)}
  const wins=[0,0];let stop=-1;inputs.forEach((x,i)=>{if(stop>=0)return;try{const winner=setWinner(e,{a:x.a===""?NaN:Number(x.a),b:x.b===""?NaN:Number(x.b),ta:x.ta===""?null:Number(x.ta),tb:x.tb===""?null:Number(x.tb)});wins[winner==="A"?0:1]++;if(Math.max(...wins)===(e.best_of+1)/2)stop=i}catch{}});

  function confirmScore(){try{const next=applyCommand(s!,e.owner_user_id,{type:"score",event_version:e.version,match_id:m!.id,match_version:formVersion,scores,confirmed:true},{id:()=>crypto.randomUUID(),now:()=>new Date().toISOString()});const changed=next.matches.filter(n=>{const old=s!.matches.find(o=>o.id===n.id);return n.id!==m!.id&&(!old||old.entry_a_id!==n.entry_a_id||old.entry_b_id!==n.entry_b_id)});setConfirmText(changed.length?(en?`Changing this result will rebuild ${changed.length} upcoming match(es) and refresh standings. Matches already started will not be overwritten.`:`修改本场赛果会重建 ${changed.length} 场尚未开始的后续对阵，并重新计算排名；已经开始的后续比赛不会被覆盖。`):(en?"This will replace the recorded result for this match and recalculate the event result.":"将用新比分替换本场已记录赛果，并重新计算本场结果。"));setConfirm(()=>()=>{void send("score",{scores},true)})}catch(err){setError(explainError(err))}}
  function update(i:number,key:"a"|"b"|"ta"|"tb",value:string){setEditing(true);setInputs(old=>{const next=old.map((x,j)=>j===i?{...x,[key]:value}:x),w=[0,0];let won=false;return next.map(x=>{if(won)return{a:"",b:"",ta:"",tb:""};try{const side=setWinner(e,{a:x.a===""?NaN:Number(x.a),b:x.b===""?NaN:Number(x.b),ta:x.ta===""?null:Number(x.ta),tb:x.tb===""?null:Number(x.tb)});w[side==="A"?0:1]++;won=Math.max(...w)===(e.best_of+1)/2}catch{}return x})})}

  return <><Header title={mode==="live"?t("liveScoring"):mode==="direct"?(en?"Record score":"录入比分"):t("matchDetail")}/><main className="page"><span className="eyebrow">{m.stage==="knockout"?(s.matches.filter(x=>x.stage==="knockout"&&!x.is_bye).length===1?(en?"SINGLE MATCH":"单场对决"):(en?"KNOCKOUT":"淘汰赛")):(en?"MATCH DAY":t("match"))} · {t("round")} {m.round_no}</span><div className="row between"><span className="badge">{m.is_bye?t("bye"):m.status==="finished"?t("finished"):m.status==="ongoing"?t("ongoing"):t("notStarted")}</span><small className="muted">{e.best_of===1?(en?"1 set":"1盘制"):e.best_of===3?(en?"Best of 3 sets":"3盘2胜"):(en?"Best of 5 sets":"5盘3胜")} · {labelFor(e.scoring_type,language)}</small></div><h2>{a} <span className="muted">vs</span> {b}</h2><ErrorNotice message={error||q.error} retry={()=>optimisticPoints.length?flushPointQueue():q.refresh()}/>{editing&&formVersion!==undefined&&mode==="direct"&&m.version!==formVersion&&<div className="error">{t("formStale")}</div>}{mode==="live"&&<><div className="score-state">{liveLabel}</div><div className="score-court"><div className="score-head"><span>{a}</span><span>{b}</span></div><div className="points"><span>{display.a}</span><span>{display.b}</span></div><div className="game-score">{live.winner?`${t("finalSetScore")} ${live.wins.join(" : ")}`:(en?`Set ${currentSetNumber(live)} · Game ${currentGameNumber(live)} · ${t("gameScore")} ${live.games.join(" : ")}`:`第 ${currentSetNumber(live)} 盘 · 第 ${currentGameNumber(live)} 局 · ${t("gameScore")} ${live.games.join(" : ")}`)}</div>{optimisticPoints.length>0&&<div className="muted small" role="status">{en?`Syncing ${optimisticPoints.length} point${optimisticPoints.length>1?"s":""}…`:`正在同步 ${optimisticPoints.length} 分…`}</div>}<div className="point-actions"><button disabled={!canScore||busy||!!live.winner||m.scoring_mode==="direct"} onClick={()=>enqueuePoint("A")}>＋1 {t("point")}</button><button disabled={!canScore||busy||!!live.winner||m.scoring_mode==="direct"} onClick={()=>enqueuePoint("B")}>＋1 {t("point")}</button></div></div><button className="secondary full" disabled={!canScore||busy||optimisticPoints.length>0||!logs.some(l=>!l.voided_at)||m.scoring_mode==="direct"} onClick={()=>send("undo")}>{t("undoLastPoint")}</button></>}{mode==="direct"&&<><p className="small muted">{en?"Enter each completed set in order. For a one-set match, one valid set result completes the match; 6 games means the target games inside that set, not six sets or rounds.":"按盘依次录入已完成比分。1盘制比赛只需录入这一盘；“每盘先到6局”指这一盘内的局数目标，不是6盘或6轮比赛。"}</p><div className="row between"><strong>{a}</strong><strong>{b}</strong></div>{inputs.map((x,i)=>{const tb=!isPointSet(e)&&Math.max(Number(x.a),Number(x.b))===tieTrigger(e)+1&&Math.min(Number(x.a),Number(x.b))===tieTrigger(e);return <section className="card" key={i}><div className="score-input-row"><span>{en?`Set ${i+1}`:`第${i+1}盘`}</span><input type="number" inputMode="numeric" min="0" value={x.a} disabled={!canScore||busy||(stop>=0&&i>stop)} onChange={ev=>update(i,"a",ev.target.value)}/><span>:</span><input type="number" inputMode="numeric" min="0" value={x.b} disabled={!canScore||busy||(stop>=0&&i>stop)} onChange={ev=>update(i,"b",ev.target.value)}/></div>{(tb||x.ta||x.tb)&&<div className="score-input-row"><span>{t("tiebreak")}</span><input className="tb" type="number" value={x.ta} disabled={!canScore||busy} onChange={ev=>update(i,"ta",ev.target.value)}/><span>:</span><input className="tb" type="number" value={x.tb} disabled={!canScore||busy} onChange={ev=>update(i,"tb",ev.target.value)}/></div>}</section>})}{editing&&validation&&<p className="notice">{validation}</p>}<button className="full" disabled={!canScore||busy||!!validation||(editing&&m.version!==formVersion)} onClick={()=>m.status==="finished"?confirmScore():send("score",{scores})}>{busy?(en?"Saving…":"正在保存…"):m.status==="finished"?(en?"Correct recorded score":"更正已录比分"):(en?"Save match result":"保存本场比分")}</button></>}{mode==="detail"&&<div className="detail-score"><strong>{sets.filter(x=>x.winner_entry_id===m.entry_a_id).length}</strong><span>{en?"Sets won":"盘分"}</span><strong>{sets.filter(x=>x.winner_entry_id===m.entry_b_id).length}</strong></div>}{mode!=="direct"&&<><h3>{sets.length?(en?"Completed sets":"已完成盘分"):(en?"Match record":"比赛记录")}</h3>{sets.length?<table className="score-table"><thead><tr><th>{en?"Player / team":"参赛者"}</th>{sets.map(x=><th key={x.set_no}>{en?`Set ${x.set_no}`:`第${x.set_no}盘`}</th>)}</tr></thead><tbody><tr><td>{a}</td>{sets.map(x=><td key={x.set_no}>{x.a_games_or_points}</td>)}</tr><tr><td>{b}</td>{sets.map(x=><td key={x.set_no}>{x.b_games_or_points}</td>)}</tr></tbody></table>:<p className="muted">{m.is_bye?(en?"Bye this round; no score is required.":"本轮轮空，不需要记分。"):(en?"No completed sets yet.":"尚无已完成盘分。")}</p>}</>}{mode==="detail"&&canScore&&<div className="stack"><Link className="button" to={base+"/score"}>{m.status==="finished"?(en?"Correct score":"更正比分"):(en?"Record score":"录入比分")}</Link>{m.scoring_mode!=="direct"&&<Link className="button secondary" to={base+"/live"}>{en?"Point-by-point scoring":"逐分实时记分"}</Link>}{m.status==="not_started"&&<button className="text-button" disabled={busy} onClick={()=>send("begin")}>{en?"Mark match started":"标记本场已开始"}</button>}</div>}{!canScore&&<p className="notice">{!owner?(en?"Visitors and players can view this match; only the event creator can score it.":"访客与参赛者可查看；只有创建者能记分。"):e.status==="finished"?(en?"The event is finished. Scores are read-only.":"赛事已结束，比分只读。"):e.status!=="ongoing"?(en?"Start the event from event management before scoring.":"请在赛事管理中先开始赛事。"):(en?"This match is not ready for scoring yet.":"本场尚未满足记分条件。")}</p>}<Link className="text-button full" to={"/events/"+id+(owner?"/manage":"")}>{en?"Back to event · View draw and standings":"返回赛事 · 查看对阵与排名"}</Link></main>{confirm&&<Confirm title={en?"Confirm score correction":"确认更正比分"} description={confirmText} busy={busy} onCancel={()=>setConfirm(null)} onConfirm={confirm}/>}</>}