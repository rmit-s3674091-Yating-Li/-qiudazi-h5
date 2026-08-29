import { useState } from "react";
import { Avatar, Header, Loading, Empty, ErrorNotice } from "../components/UI";
import { rpc, explainError } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";
import { useLanguage } from "../i18n";

type Status="pending"|"accepted"|"cancelled"|"expired";
type ClaimInviteRow={id:string;token:string;player_id:string;player_name:string;status:Status;created_at:string;responded_at:string|null};
type ConnectionInviteRow={id:string;token:string;status:Status;created_at:string;responded_at:string|null;accepted_by_nickname:string|null;accepted_by_avatar_url:string|null};

async function shareUrl(title:string,text:string,url:string,copied:string){if(navigator.share){await navigator.share({title,text,url});return "";}await navigator.clipboard.writeText(url);return copied;}
const badgeClass=(s:Status)=>s==="accepted"?"success":s==="pending"?"":"finished";

export function PartnerInvitesPage(){
  const{language,t}=useLanguage();const en=language==="en";const[feedback,setFeedback]=useState("");const[busyId,setBusyId]=useState("");
  const ordinary=useQuery("my-connection-invites",()=>rpc<ConnectionInviteRow[]>("list_my_connection_invites"));
  const claims=useQuery("my-player-claim-invites",()=>rpc<ClaimInviteRow[]>("list_my_player_claim_invites"));
  const dateText=(v:string)=>new Date(v).toLocaleDateString(en?"en-US":"zh-CN");
  const statusText=(s:Status,claim=false)=>s==="pending"?(en?"Waiting to join":"等待加入"):s==="accepted"?(claim?(en?"Linked":"已关联"):(en?"Joined":"已加入")):s==="cancelled"?(en?"Cancelled":"已取消"):(en?"Expired":"已失效");
  async function reshareOrdinary(invite:ConnectionInviteRow){const url=`${window.location.origin}${window.location.pathname}?connect=${encodeURIComponent(invite.token)}`;try{setFeedback(await shareUrl(en?"Tennis partner invitation":"球搭子邀请",en?"Join me on Qiu Dazi so we can play together.":"邀请你加入球搭子，一起打球。",url,en?"Invitation link copied":"邀请链接已复制"));}catch(e){if((e as Error).name!=="AbortError")setFeedback(en?"Sharing failed. Please try again.":"分享失败，请重试");}}
  async function cancelOrdinary(invite:ConnectionInviteRow){setBusyId(invite.id);setFeedback("");try{await rpc("cancel_connection_invite",{p_invite_id:invite.id});await ordinary.refresh();setFeedback(en?"Invitation cancelled":"邀请已取消");}catch(e){setFeedback(explainError(e));}finally{setBusyId("");}}
  async function reshareClaim(invite:ClaimInviteRow){const url=`${window.location.origin}${window.location.pathname}?claim=${encodeURIComponent(invite.token)}`;try{setFeedback(await shareUrl(en?`Invite ${invite.player_name} to join Qiu Dazi`:`邀请 ${invite.player_name} 加入球搭子`,en?"I have already recorded some matches for you. After you join, those records can be linked to your tennis profile.":"我之前已经在球搭子里帮你记录过比赛。加入后，这些记录可以关联到你的打球档案。",url,en?"Invitation link copied":"邀请链接已复制"));}catch(e){if((e as Error).name!=="AbortError")setFeedback(en?"Sharing failed. Please try again.":"分享失败，请重试");}}
  async function cancelClaim(invite:ClaimInviteRow){setBusyId(invite.id);setFeedback("");try{await rpc("cancel_player_claim_invite",{p_invite_id:invite.id});await claims.refresh();setFeedback(en?"Invitation cancelled":"邀请已取消");}catch(e){setFeedback(explainError(e));}finally{setBusyId("");}}

  const firstLoading=ordinary.loading&&!ordinary.data&&claims.loading&&!claims.data;
  const hasAny=!!ordinary.data?.length||!!claims.data?.length;
  return <><Header title={t("partnerInviteHistory")}/><main className="page">
    <span className="eyebrow">{en?"PARTNER INVITATIONS":"邀请记录"}</span><h1>{t("partnerInviteHistory")}</h1>
    <p className="muted">{en?"This page tracks partner invitations you have sent. New invitations still start from Partners.":"这里记录你发出的球搭子邀请。邀请入口仍然都在“球搭子们”。"}</p>
    {feedback&&<div className="notice">{feedback}</div>}
    <ErrorNotice message={ordinary.error||claims.error} retry={()=>{ordinary.refresh();claims.refresh();}}/>
    {firstLoading?<Loading/>:!hasAny?<Empty title={en?"No partner invitation history yet":"还没有球搭子邀请记录"}><p>{en?"Invite a new partner, or invite a temporary partner to join, and progress will appear here.":"邀请新的球搭子，或邀请临时球搭子加入后，进度会出现在这里。"}</p></Empty>:<>
      <div className="section-heading"><div><h2>{en?"Partner invitations":"邀请球搭子"}</h2><p className="muted small">{en?"Invite someone who has not connected with you yet.":"直接邀请还没有和你建立关系的人。"}</p></div></div>
      {ordinary.data?.length?<div className="partner-list">{ordinary.data.map(inv=><div className="card partner-card" key={inv.id}><div className="row between"><div className="row"><Avatar path={inv.accepted_by_avatar_url} name={inv.accepted_by_nickname||(en?"Partner":"球搭子")} size={38}/><div><strong>{inv.status==="accepted"?(inv.accepted_by_nickname||(en?"New partner":"已加入的球搭子")):(en?"Partner invitation":"球搭子邀请")}</strong><div className="muted small">{en?`Sent ${dateText(inv.created_at)}`:`${dateText(inv.created_at)} 发出`}</div></div></div><span className={`badge ${badgeClass(inv.status)}`}>{statusText(inv.status)}</span></div>{inv.status==="pending"&&<div className="partner-card-action invite-actions"><button className="text-button" onClick={()=>reshareOrdinary(inv)}>{en?"Share again":"重新分享"}</button><button className="text-button muted-action" disabled={busyId===inv.id} onClick={()=>cancelOrdinary(inv)}>{busyId===inv.id?(en?"Cancelling…":"正在取消…"):(en?"Cancel invitation":"取消邀请")}</button></div>}</div>)}</div>:<p className="muted small">{en?"No direct partner invitations yet.":"还没有直接邀请记录。"}</p>}

      <div className="section-heading"><div><h2>{en?"Temporary partner joining":"临时球搭子加入"}</h2><p className="muted small">{en?"Invite a temporary partner to join and link the match history you previously recorded for them.":"邀请临时球搭子加入，并关联之前由你代录的比赛记录。"}</p></div></div>
      {claims.data?.length?<div className="partner-list">{claims.data.map(inv=><div className="card partner-card" key={inv.id}><div className="row between"><div><strong>{inv.player_name}</strong><div className="muted small">{en?`Sent ${dateText(inv.created_at)} · History link`:`${dateText(inv.created_at)} 发出 · 历史记录关联`}</div></div><span className={`badge ${badgeClass(inv.status)}`}>{statusText(inv.status,true)}</span></div>{inv.status==="pending"&&<div className="partner-card-action invite-actions"><button className="text-button" onClick={()=>reshareClaim(inv)}>{en?"Share again":"重新分享"}</button><button className="text-button muted-action" disabled={busyId===inv.id} onClick={()=>cancelClaim(inv)}>{busyId===inv.id?(en?"Cancelling…":"正在取消…"):(en?"Cancel invitation":"取消邀请")}</button></div>}</div>)}</div>:<p className="muted small">{en?"No temporary-partner join history yet.":"还没有临时球搭子加入记录。"}</p>}
    </>}
  </main></>;
}
