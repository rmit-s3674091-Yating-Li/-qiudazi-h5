import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Pencil } from "lucide-react";
import { Avatar, Empty, ErrorNotice, Header, Loading, levelDisplay } from "../components/UI";
import { explainError, rpc } from "../repositories/supabase";
import { invalidateQuery, useQuery } from "../hooks/useQuery";

type Detail={profile:{player_id:string;name:string;avatar_url:string|null;level:string|null;city:string|null;play_times:string[];play_preference:"singles"|"doubles"|"both"|null};has_history:boolean}|null;
type CreatedClaimInvite={token:string;player_id:string;player_name:string};
const pref:Record<string,string>={singles:"偏好单打",doubles:"偏好双打",both:"单打 / 双打都打"};
async function shareUrl(title:string,text:string,url:string){if(navigator.share){await navigator.share({title,text,url});return "";}await navigator.clipboard.writeText(url);return "邀请链接已复制";}

export function TemporaryPartnerDetailPage(){
  const{playerId}=useParams();const[busy,setBusy]=useState(false),[feedback,setFeedback]=useState("");
  const q=useQuery(`temporary-partner-${playerId}`,()=>rpc<Detail>("get_managed_player_profile",{p_player_id:playerId}));
  async function invite(){if(!playerId||busy)return;setBusy(true);setFeedback("");try{const rows=await rpc<CreatedClaimInvite[]>("create_player_claim_invite",{p_player_id:playerId});const i=rows[0];if(!i)throw new Error("邀请创建失败，请重试");invalidateQuery("my-player-claim-invites");const url=`${window.location.origin}${window.location.pathname}?claim=${encodeURIComponent(i.token)}`;setFeedback(await shareUrl(`邀请 ${i.player_name} 加入球搭子`,"我之前已经在球搭子里帮你记录过比赛。加入后，这些记录可以关联到你的打球档案。",url));}catch(e){if((e as Error).name!=="AbortError")setFeedback(explainError(e));}finally{setBusy(false);}}
  if(q.loading&&!q.data)return <><Header title="临时球搭子档案"/><main className="page"><Loading/></main></>;
  if(!q.data)return <><Header title="临时球搭子档案"/><main className="page"><ErrorNotice message={q.error} retry={q.refresh}/>{!q.error&&<Empty title="没有找到这份临时球搭子档案"><p>这份档案可能已经关联到真实用户，或不再由你管理。</p></Empty>}</main></>;
  const{profile,has_history}=q.data;
  return <><Header title="临时球搭子档案" action={<Link className="text-button" to={`/players/${profile.player_id}/edit`}><Pencil size={15}/>编辑</Link>}/><main className="page"><div className="profile-banner"><Avatar path={profile.avatar_url} name={profile.name} size={72}/><div><span className="eyebrow">MANAGED TENNIS PROFILE</span><h1>{profile.name}</h1><p>{[profile.level?levelDisplay(profile.level):null,profile.city,profile.play_preference?pref[profile.play_preference]:null].filter(Boolean).join(" · ")||"由你代为管理的打球档案"}</p></div></div>{feedback&&<div className="notice">{feedback}</div>}<ErrorNotice message={q.error} retry={q.refresh}/><div className="card"><div className="section-heading"><h2>基础资料</h2></div><div className="event-facts"><div><small>水平</small><strong>{profile.level?levelDisplay(profile.level):"未填写"}</strong></div><div><small>常打城市</small><strong>{profile.city||"未填写"}</strong></div><div><small>偏好</small><strong>{profile.play_preference?pref[profile.play_preference]:"未填写"}</strong></div><div><small>常打时间</small><strong>{profile.play_times?.length?profile.play_times.join("、"):"未填写"}</strong></div></div></div><div className="notice"><strong>{has_history?"已经积累比赛记录":"还没有比赛记录"}</strong><p>{has_history?"具体战绩会继续保留在后台。TA 自己加入球搭子后，可以把这些记录关联到自己的完整打球档案。":"以后代 TA 参加并完成比赛后，记录会自动积累；TA 加入后再解锁完整档案。"}</p></div><button className="full" disabled={busy} onClick={invite}>{busy?"正在准备邀请…":"邀请 TA 加入球搭子"}</button><p className="muted small profile-hint">你可以继续编辑基础资料、替 TA 报名和积累比赛记录；完整战绩由 TA 加入后查看。</p></main></>;
}
