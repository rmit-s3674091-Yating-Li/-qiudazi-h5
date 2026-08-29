import { Link, useParams } from "react-router-dom";
import { LockKeyhole, MapPin, Share2 } from "lucide-react";
import { Empty, ErrorNotice, Header, Loading, labels, levelLabel } from "../components/UI";
import { explainError, rpc } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";

type Preview={id:string;name:string;visibility:"private";status:string;match_type:"singles"|"doubles";format:string;level:string|null;city:string|null;can_view_full:boolean}|null;

export function PrivateEventPreviewPage(){
  const{id}=useParams();
  const q=useQuery("private-event-preview-"+id,()=>rpc<Preview>("get_private_event_preview",{p_event_id:id}));
  async function share(){const url=`${location.origin}${location.pathname}#/events/${id}/preview`;try{if(navigator.share){await navigator.share({title:q.data?.name||"私有赛事",url});return;}await navigator.clipboard.writeText(url);}catch(e){if((e as Error).name!=="AbortError")throw new Error(explainError(e));}}
  if(q.loading&&!q.data)return <><Header title="私有赛事"/><main className="page"><Loading/></main></>;
  if(!q.data)return <><Header title="私有赛事"/><main className="page"><ErrorNotice message={q.error} retry={q.refresh}/>{!q.error&&<Empty title="没有找到这场赛事"><p>赛事可能已经结束或不再提供预览。</p></Empty>}</main></>;
  const e=q.data;
  return <><Header title="私有赛事" action={<button className="icon-button" aria-label="分享赛事预览" onClick={()=>void share()}><Share2 size={19}/></button>}/><main className="page"><section className="private-preview-hero"><span className="private-lock"><LockKeyhole size={18}/> 私有赛事</span><h1>{e.name}</h1><p>{labels[e.match_type]}{e.level?` · ${levelLabel(e.level)}级`:""} · {labels[e.format]}</p></section><div className="private-preview-facts"><div><MapPin size={17}/><span><small>城市</small><strong>{e.city||"待定"}</strong></span></div><div><LockKeyhole size={17}/><span><small>隐私保护</small><strong>具体时间、场地和参与者仅向受邀球友开放</strong></span></div></div><div className="notice"><strong>这是一场私有赛事</strong><p>大厅中的预览只用于发现赛事，不代表已经获得参赛资格。完整信息需要组织者邀请，或在双打场景中由已有资格的搭档发出组队邀请。</p></div>{e.can_view_full?<Link className="button full" to={`/events/${e.id}`}>查看完整赛事</Link>:<><button className="full" disabled>仅受邀球友可查看详情</button><p className="muted small center">如果球搭子邀请你参赛或组队，接受邀请后即可查看完整信息。</p></>}</main></>;
}
