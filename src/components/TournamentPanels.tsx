import { useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Trophy, GitBranch, ListOrdered, ImagePlus } from "lucide-react";
import type { Match, Snapshot } from "../domain/types";
import { ranking, groupRankings, podium } from "../domain/RankingEngine";
import { entryName, ErrorNotice, Confirm } from "./UI";
import { supabase, uploadAsset, explainError } from "../repositories/supabase";
import { imageBlob, watermarkPhoto } from "../utils/images";
import { useLanguage } from "../i18n";
import { ProtectedEventPhoto } from "./ProtectedEventPhoto";

function podiumLabel(label:string, language:"zh-CN"|"en"){
  if(language!=="en")return label;
  if(label==="冠军")return "Champion";
  if(label==="亚军")return "Runner-up";
  if(label.includes("季军"))return "Third place";
  return label;
}

export function MatchCard({ m, s }: { m: Match; s: Snapshot }) {
  const {language}=useLanguage();
  const a = s.entries.find((e) => e.id === m.entry_a_id),
    b = s.entries.find((e) => e.id === m.entry_b_id),
    sets = s.set_scores.filter((x) => x.match_id === m.id).sort((a, b) => a.set_no - b.set_no);
  const status=m.is_bye?(language==="en"?"Bye":"轮空"):m.status==="not_started"?(language==="en"?"Not started":"未开始"):m.status==="ongoing"?(language==="en"?"In progress":"进行中"):(language==="en"?"Finished":"已结束");
  const aName=a?entryName(a):m.is_bye?(language==="en"?"Bye":"轮空"):(language==="en"?"TBD":"待晋级");
  const bName=b?entryName(b):m.is_bye?(language==="en"?"Bye":"轮空"):(language==="en"?"TBD":"待晋级");
  return <Link className="match-card" to={"/events/" + s.event.id + "/matches/" + m.id}>
    <div className="row between"><small>{status}</small><small>{m.is_bye ? "Bye" : sets.length ? (language==="en"?"Set score":"盘分") : "VS"}</small></div>
    <div className={"row between " + (m.winner_entry_id === a?.id ? "winner" : "")}><span>{aName}</span><b className="score">{sets.map((x) => x.a_games_or_points).join(" · ")}</b></div>
    <div className={"row between " + (m.winner_entry_id === b?.id ? "winner" : "")}><span>{bName}</span><b className="score">{sets.map((x) => x.b_games_or_points).join(" · ")}</b></div>
    {m.is_bye && <small>{m.stage === "knockout" ? (language==="en"?"Advances automatically to the next round":"自动晋级下一轮") : (language==="en"?"Rest this round; does not count as a win":"本轮休息，不计入胜场")}</small>}
  </Link>;
}
function DrawPlaceholder({ s }: { s: Snapshot }) {
  const {language}=useLanguage();
  const knockout = s.event.format === "knockout";
  const title=knockout?(language==="en"?"Knockout draw":"淘汰签表"):s.event.format==="group_knockout"?(language==="en"?"Group stage & knockout draw":"小组赛与淘汰签表"):(language==="en"?"Round matchups":"轮次对阵");
  return <div className="tournament-placeholder"><div className="placeholder-heading row"><span className="placeholder-icon"><GitBranch size={19}/></span><div><strong>{title}</strong><p className="muted small">{language==="en"?"Matches will appear here after the roster is locked and the draw is generated.":"名单锁定并生成对阵后，比赛会直接填入这里。"}</p></div></div><div className="draw-skeleton" aria-hidden="true"><section><small>{knockout ? (language==="en"?"First round":"首轮") : (language==="en"?"Round 1":"第 1 轮")}</small><div className="skeleton-match"><i/><i/></div><div className="skeleton-match"><i/><i/></div></section><span className="draw-connector">›</span><section><small>{knockout ? (language==="en"?"Next round":"下一轮") : (language==="en"?"Round 2":"第 2 轮")}</small><div className="skeleton-match compact"><i/><i/></div></section></div><p className="placeholder-foot">{language==="en"?"No real matchups yet, so no players or scores are fabricated.":"现在还没有真实对阵，不展示虚构选手或比分。"}</p></div>;
}
export function DrawPanel({ s }: { s: Snapshot }) {
  const {language}=useLanguage();
  const [group, setGroup] = useState(1);
  const ko = s.matches.filter((m) => m.stage === "knockout"), league = s.matches.filter((m) => m.stage !== "knockout" && (m.group_no === null || m.group_no === group));
  return <>
    {!s.matches.length && <DrawPlaceholder s={s}/>} 
    {s.event.format === "group_knockout" && s.matches.length > 0 && <div className="chips">{Array.from({ length: s.event.group_count! }, (_, i) => <button key={i} className={group === i + 1 ? "active":""} onClick={() => setGroup(i + 1)}>{language==="en"?`Group ${String.fromCharCode(65+i)}`:`${String.fromCharCode(65+i)} 组`}</button>)}</div>}
    {s.event.format === "group_knockout" && !!league.length && <div className="card"><h3>{language==="en"?"Live group standings":"本组实时排名"}</h3>{groupRankings(s)[group - 1].map((r) => <div className="row between small" key={r.entry_id}><span>{r.rank}. {entryName(s.entries.find((e) => e.id === r.entry_id))}</span><span>{language==="en"?`${r.wins} wins · game diff ${r.game_difference}`:`${r.wins}胜 · 局差${r.game_difference}`}</span></div>)}</div>}
    {[...new Set(league.map((m) => m.round_no))].sort((a, b) => a - b).map((r) => <section key={r}><h3>{language==="en"?`Round ${r}`:`第 ${r} 轮`}</h3>{league.filter((m) => m.round_no === r).map((m) => <MatchCard key={m.id} m={m} s={s} />)}</section>)}
    {!!ko.length && <><h2>{language==="en"?"Knockout draw":"淘汰签表"}</h2><p className="small muted">{language==="en"?"Swipe horizontally to view rounds · Tap a match to view or score":"左右滑动查看各轮 · 点击比赛查看或记分"}</p><div className="bracket">{[...new Set(ko.map((m) => m.round_no))].sort((a, b) => a - b).map((r) => <section key={r} className="bracket-round"><h3>{ko.filter((m) => m.round_no === r).length === 1 ? (language==="en"?"Final":"决赛") : ko.filter((m) => m.round_no === r).length === 2 ? (language==="en"?"Semifinals":"半决赛") : (language==="en"?`Round ${r}`:`第 ${r} 轮`)}</h3>{ko.filter((m) => m.round_no === r).sort((a, b) => a.bracket_position! - b.bracket_position!).map((m) => <MatchCard key={m.id} m={m} s={s} />)}</section>)}</div></>}
    {s.event.format === "group_knockout" && !ko.length && !!league.length && <p className="notice">{language==="en"?"After all group matches finish, qualifiers and the knockout draw are generated automatically from the standings.":"全部小组赛完成后，系统按排名自动生成晋级名单与淘汰签表。"}</p>}
  </>;
}
function RankingPlaceholder() {
  const {language}=useLanguage();
  return <div className="tournament-placeholder ranking-placeholder"><div className="placeholder-heading row"><span className="placeholder-icon"><ListOrdered size={19}/></span><div><strong>{language==="en"?"Event standings":"赛事排名"}</strong><p className="muted small">{language==="en"?"Standings update automatically from real results after matches begin.":"比赛开始后，排名会根据真实赛果自动更新。"}</p></div></div><div className="ranking-table-skeleton" aria-hidden="true"><div className="ranking-table-head"><span>{language==="en"?"Rank":"名次"}</span><span>{language==="en"?"Player":"参赛者"}</span><span>{language==="en"?"Played":"已赛"}</span><span>{language==="en"?"W/L":"胜负"}</span><span>{language==="en"?"Diff":"局差"}</span></div>{[1,2,3].map(n=><div className="ranking-table-row" key={n}><b>0{n}</b><i/><span>—</span><span>—</span><span>—</span></div>)}</div><p className="placeholder-foot">{language==="en"?"The standings area is ready; no fake ranks appear before real results exist.":"排名区域已经就位；没有真实赛果前不生成虚假名次。"}</p></div>;
}
export function RankingPanel({ s }: { s: Snapshot }) {
  const {language}=useLanguage();
  const [group, setGroup] = useState(1);
  const rows = s.event.format === "group_knockout" ? groupRankings(s)[group - 1] : ranking(s);
  const results = podium(s), complete = s.matches.length > 0 && s.matches.every((m) => m.status === "finished");
  return <>
    {!s.matches.length && <RankingPlaceholder/>}
    {complete && results.length > 0 && <div className="winner-banner"><Trophy size={30} /><h2>{entryName(results[0].entries[0])}</h2><p>{language==="en"?"Champion":"本场冠军"}</p></div>}
    {s.matches.length > 0 && (s.event.format === "knockout" ? (results.length ? results.map((r) => <div className="card" key={r.label}><span className="badge">{podiumLabel(r.label,language)}</span><h3>{r.entries.map(entryName).join(language==="en"?", ":"、")}</h3></div>) : <div className="tournament-placeholder compact-placeholder"><div className="placeholder-heading row"><span className="placeholder-icon"><Trophy size={18}/></span><div><strong>{language==="en"?"Podium awaiting results":"领奖台等待赛果"}</strong><p className="muted small">{language==="en"?"Champion, runner-up and joint third place appear after the final.":"决赛结束后，这里会展示冠军、亚军和并列季军。"}</p></div></div></div>) : <>
      {s.event.format === "group_knockout" && <div className="chips">{Array.from({ length: s.event.group_count! }, (_, i) => <button key={i} className={group === i + 1 ? "active":""} onClick={() => setGroup(i + 1)}>{language==="en"?`Group ${String.fromCharCode(65+i)}`:`${String.fromCharCode(65+i)} 组`}</button>)}</div>}
      {rows.map((row) => <div className="card" key={row.entry_id}><div className="row"><b className="rank-number">{String(row.rank).padStart(2, "0")}</b><strong className="grow">{entryName(s.entries.find((e) => e.id === row.entry_id))}</strong>{s.event.format === "group_knockout" && row.rank <= s.event.qualifiers_per_group! && <span className="badge">{s.matches.filter((m) => m.stage === "group").every((m) => m.status === "finished") ? (language==="en"?"Qualified":"晋级") : (language==="en"?"Qualifying position":"暂列晋级位")}</span>}</div><div className="ranking-stats"><span>{language==="en"?`Played ${row.played}`:`已赛 ${row.played}`}</span><span>{language==="en"?`${row.wins} W / ${row.losses} L`:`${row.wins} 胜 / ${row.losses} 负`}</span><span>{language==="en"?`Game diff ${row.game_difference>0?"+":""}${row.game_difference}`:`局差 ${row.game_difference>0?"+":""}${row.game_difference}`}</span><span>{language==="en"?`Games won ${row.games_won}`:`胜局 ${row.games_won}`}</span></div></div>)}
      <p className="muted small">{language==="en"?"Order: wins → head-to-head when exactly two players are tied → game difference → games won → registration time. Head-to-head is not used for ties among three or more players; point-race points do not count toward game difference.":"排序：胜场 → 两人同胜场时相互战绩 → 局差 → 胜局 → 报名时间。三人及以上同胜场不使用两两相互战绩；连续抢分的小分不计入局差。"}</p>
    </>)}
  </>;
}
export function PhotoPanel({ s, owner, onDone }: { s: Snapshot; owner: boolean; onDone: () => void; }) {
  const {language}=useLanguage();
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function upload(file: File) {
    setBusy(true); setError(""); const paths: string[] = []; let saved = false;
    try {
      const original = await imageBlob(file), marked = await watermarkPhoto(original, s);
      const { data } = await supabase!.auth.getSession();
      if(!data.session) throw new Error(language==="en"?"Restore your sign-in state first.":"请先恢复登录状态");
      const folder = data.session.user.id + "/" + s.event.id + "/" + crypto.randomUUID();
      paths.push(await uploadAsset(original, "event-photos", folder + "-original.jpg"));
      paths.push(await uploadAsset(marked, "event-photos", folder + "-watermark.jpg"));
      const {error:finalizeError}=await supabase!.functions.invoke("photo-management",{body:{action:"finalize_upload",event_id:s.event.id,version:s.photo?.version||0,original_path:paths[0],preview_path:paths[1]}});
      if(finalizeError) throw finalizeError;
      saved = true; onDone();
    } catch (e) { setError(explainError(e)); }
    finally { if (!saved && paths.length) await supabase!.storage.from("event-photos").remove(paths); setBusy(false); }
  }
  return <>
    {s.photo ? <><ProtectedEventPhoto previewPath={s.photo.watermarked_url} originalPath={s.photo.original_url} alt={language==="en"?`${s.event.name} post-match photo with final standings watermark`:s.event.name + "赛后合影，含最终名次水印"}/><p className="muted small">{language==="en"?"Protected preview · HD access expires shortly":"受保护水印预览 · 高清授权短时有效"} · {new Date(s.photo.uploaded_at).toLocaleDateString(language==="en"?"en-US":"zh-CN")}</p></> : <div className="photo-upload-stage"><span className="photo-upload-icon"><Camera size={28}/></span><h3>{language==="en"?"Keep this match in a photo":"把这场球，留在照片里"}</h3><p className="muted">{s.event.status === "finished" ? owner ? (language==="en"?"Choose a photo from your phone. An event watermark will be generated automatically after upload.":"从手机照片中选择一张本场合影。上传后会自动生成赛事水印。") : (language==="en"?"Waiting for the organizer to upload the event photo.":"等待组织者上传本场合影。") : (language==="en"?"After the event finishes, this area will hold the event photo.":"比赛结束后，这里会成为本场赛事的合影位置。")}</p><div className="photo-frame-preview" aria-hidden="true"><ImagePlus size={24}/><span>{language==="en"?"Main event photo":"赛事主合影"}</span></div></div>}
    <ErrorNotice message={error} />
    {owner && s.event.status === "finished" && <><label className="button full photo-upload-button">{busy ? (language==="en"?"Generating watermark and uploading…":"正在生成水印并上传…") : s.photo ? (language==="en"?"Replace photo":"更换合影") : (language==="en"?"Choose photo and upload":"选择照片并上传")}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) { if (s.photo) setPending(file); else void upload(file); } e.target.value = ""; }} /></label><p className="muted small">{language==="en"?"The camera is not requested when this page opens. Choose a photo you have permission to use; the watermark includes the event name, final standings and match date.":"不会在进入页面时申请摄像头权限。请选择已取得拍摄对象许可的照片；水印包含赛事名称、最终名次和比赛日期。"}</p></>}
    {pending && <Confirm title={language==="en"?"Replace the main event photo?":"替换本场主合影？"} description={language==="en"?"The new photo will replace the current protected original and preview. If replacement cannot finish safely, the new upload is cleaned up.":"新照片将替换当前受保护原图和水印预览；若替换无法安全完成，本次新上传会被清理。"} onCancel={() => setPending(null)} onConfirm={() => { const file = pending; setPending(null); void upload(file); }} />}
  </>;
}
