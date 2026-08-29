import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, X } from "lucide-react";
import { Avatar, Empty, ErrorNotice, Header, Loading, Sheet } from "./UI";
import { explainError, rpc } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";

type Connection={connection_id:string;id:string;nickname:string|null;avatar_url:string|null;created_at:string};
type SentPartnerInvite={id:string;invitee_user_id:string;nickname:string|null;avatar_url:string|null;status:"pending"|"accepted"|"declined"|"cancelled"|"expired";self_player_id:string|null;created_at:string};
type EventInvite={id:string;event_id:string;event_name:string;event_date:string|null;venue:string|null;match_type:"singles"|"doubles";invite_kind:"event"|"doubles_partner";inviter_user_id:string;inviter_nickname:string|null;status:"pending"|"accepted"|"declined"|"cancelled"|"expired";created_at:string};

export function EventInviteSheet({eventId,open,onClose,onChanged}:{eventId:string;open:boolean;onClose:()=>void;onChanged?:()=>void}){
 const connections=useQuery("partner-invite-connections-"+eventId,()=>rpc<Connection[]>("list_connections"),15000);
 const sent=useQuery("partner-invites-sent-"+eventId,()=>rpc<SentPartnerInvite[]>("list_sent_doubles_partner_invites",{p_event_id:eventId}),10000);
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState("");
 async function invite(profileId:string){setBusy(profileId);setError("");try{await rpc("invite_doubles_partner",{p_event_id:eventId,p_invitee_user_id:profileId});await sent.refresh();onChanged?.();}catch(e){setError(explainError(e));}finally{setBusy(null)}}
 const statusByUser=new Map((sent.data||[]).map(i=>[i.invitee_user_id,i]));
 return <Sheet open={open} title="邀请双打搭档" onClose={onClose}>
  <p className="muted small">这里邀请的是本场双打搭档，不是替对方报名。TA 接受后，你再完成你们这一队的报名。</p>
  <ErrorNotice message={error||connections.error||sent.error} retry={()=>{connections.refresh();sent.refresh()}}/>
  {(connections.loading||sent.loading)&&!connections.data?<Loading/>:connections.data?.length?<div className="stack">{connections.data.map(c=>{const current=statusByUser.get(c.id);const locked=current?.status==="pending"||current?.status==="accepted";const label=current?.status==="accepted"?"已接受":current?.status==="pending"?"待回应":busy===c.id?"发送中…":"邀请做搭档";return <div className="card row" key={c.connection_id}><Avatar path={c.avatar_url} name={c.nickname||"球搭子"} size={40}/><div className="grow"><strong>{c.nickname||"球搭子"}</strong>{current?.status==="declined"&&<p className="muted small">之前暂未接受，可再次邀请</p>}</div><button className={locked?"secondary":""} disabled={locked||busy===c.id} onClick={()=>invite(c.id)}>{label}</button></div>})}</div>:<Empty title="还没有可邀请的球搭子"><p>先和朋友建立球搭子关系，再邀请 TA 成为本场搭档。</p><Link className="button secondary" to="/players" onClick={onClose}>去球搭子们</Link></Empty>}
 </Sheet>;
}

export function EventInviteInboxLink(){const q=useQuery("my-event-invites-summary",()=>rpc<EventInvite[]>("list_my_event_invites"),15000);const pending=q.data?.filter(i=>i.status==="pending").length||0;return <Link className="card row between" to="/event-invites"><div><strong>赛事邀请{pending?` · ${pending} 条待回应`:""}</strong><p className="muted small">查看双打组队等赛事邀请</p></div><ArrowRight size={18}/></Link>}

export function EventInvitesPage(){
 const q=useQuery("my-event-invites",()=>rpc<EventInvite[]>("list_my_event_invites"),10000);const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState("");
 async function respond(id:string,accept:boolean){setBusy(id);setError("");try{await rpc("respond_event_invite",{p_invite_id:id,p_accept:accept});await q.refresh();}catch(e){setError(explainError(e));}finally{setBusy(null)}}
 return <><Header title="赛事邀请"/><main className="page"><span className="eyebrow">EVENT INVITATIONS</span><h1>收到的邀请</h1><p className="muted">这里只处理结构化赛事邀请，不提供聊天。</p><ErrorNotice message={error||q.error} retry={q.refresh}/>{q.loading&&!q.data?<Loading/>:q.data?.length?<div className="stack">{q.data.map(i=>{const partner=i.invite_kind==="doubles_partner";return <article className="card" key={i.id}><p className="muted small">{i.inviter_nickname||"一位球搭子"} {partner?"邀请你作为双打搭档参加":"邀请你参加"}</p><h3>{i.event_name}</h3><p className="muted small">{i.event_date||"日期待定"} · {i.venue||"场地待定"}</p>{i.status==="pending"?<div className="row"><button className="grow" disabled={busy===i.id} onClick={()=>respond(i.id,true)}><Check size={16}/>{partner?"接受组队":"接受邀请"}</button><button className="secondary grow" disabled={busy===i.id} onClick={()=>respond(i.id,false)}><X size={16}/>{partner?"暂不组队":"暂不参加"}</button></div>:i.status==="accepted"?(partner?<p className="notice">已接受组队邀请，等待对方完成这支队伍的报名。</p>:<><p className="muted small">已接受邀请，还需要完成报名。</p><Link className="button full" to={`/events/${i.event_id}?join=1`}>去报名</Link></>):<p className="muted small">{i.status==="declined"?(partner?"已选择暂不组队":"已选择暂不参加"):"邀请已结束"}</p>}<Link className="button secondary full" to={`/events/${i.event_id}`}>查看赛事</Link></article>})}</div>:<Empty title="暂时没有赛事邀请"><p>当球搭子邀请你组队或参赛时，会出现在这里。</p></Empty>}</main></>;
}
