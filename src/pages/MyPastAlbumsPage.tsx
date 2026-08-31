import { useCallback, useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { Header, ErrorNotice, Loading, Empty, Confirm } from "../components/UI";
import { explainError, rpc, supabase } from "../repositories/supabase";
import { useLanguage } from "../i18n";

type AlbumPhoto={asset_id:string;event_id:string;event_name:string;event_date:string|null;uploaded_at:string};

export function MyPastAlbumsPage(){
  const{language}=useLanguage();const en=language==="en";
  const[rows,setRows]=useState<AlbumPhoto[]|null>(null),[urls,setUrls]=useState<Record<string,string>>({}),[hd,setHd]=useState<Record<string,string>>({}),[busy,setBusy]=useState<string>(),[deleting,setDeleting]=useState<AlbumPhoto|null>(null),[error,setError]=useState("");
  const load=useCallback(async()=>{try{const data=await rpc<AlbumPhoto[]>("list_my_past_event_albums");setRows(data);setUrls({});for(const row of data){const{data:preview,error:invokeError}=await supabase!.functions.invoke("photo-management",{body:{action:"personal_preview",asset_id:row.asset_id}});if(!invokeError&&preview?.url)setUrls(v=>({...v,[row.asset_id]:preview.url}));}}catch(e){setError(explainError(e));}},[]);
  useEffect(()=>{void load();},[load]);
  async function openHd(assetId:string){setBusy(assetId);setError("");try{const{data,error:invokeError}=await supabase!.functions.invoke("photo-management",{body:{action:"personal_original",asset_id:assetId}});if(invokeError)throw invokeError;if(data?.url)setHd(v=>({...v,[assetId]:data.url}));}catch(e){setError(explainError(e));}finally{setBusy(undefined);}}
  async function remove(photo:AlbumPhoto){setDeleting(null);setBusy(photo.asset_id);setError("");try{const{error:invokeError}=await supabase!.functions.invoke("photo-management",{body:{action:"delete_personal",asset_id:photo.asset_id}});if(invokeError)throw invokeError;await load();}catch(e){setError(explainError(e));}finally{setBusy(undefined);}}
  const events=[...new Set((rows||[]).map(r=>r.event_id))];
  return <><Header title={en?"My event album":"参与赛事相册"}/><main className="page">
    <span className="eyebrow">{en?"YOUR SAVED MATCH MEMORIES":"我的比赛记忆"}</span><h1>{en?"My event album":"参与赛事相册"}</h1>
    <p className="muted">{en?"Only photos you personally chose from events you actually played in appear here. Once imported, your copy remains even if the organizer later deletes the source event photo.":"这里只有你从自己实际参加的赛事中主动加入的照片。导入成功后就是你的独立个人相册资产，即使赛事创建人之后删除源照片，你已经保存的照片也不会消失。"}</p>
    <ErrorNotice message={error}/>{rows===null?<Loading/>:rows.length===0?<Empty title={en?"No saved event photos yet":"还没有保存赛事照片"}><p>{en?"Open an event you played in and add the photos you want to keep.":"进入你实际参加过的赛事相册，逐张选择“加入我的参与赛事相册”。"}</p></Empty>:events.map(eventId=>{const photos=rows.filter(r=>r.event_id===eventId);const first=photos[0];return <section className="settings-section" key={eventId}><div className="section-heading"><div><h2>{first.event_name}</h2><p className="muted small">{first.event_date||new Date(first.uploaded_at).toLocaleDateString(en?"en-US":"zh-CN")}</p></div></div><div className="stack">{photos.map(photo=><article className="card" key={photo.asset_id}>{hd[photo.asset_id]?<><img className="photo" src={hd[photo.asset_id]} alt={first.event_name}/><button className="button secondary full" onClick={()=>setHd(v=>{const n={...v};delete n[photo.asset_id];return n;})}><X size={17}/>{en?"Close HD":"关闭高清"}</button></>:urls[photo.asset_id]?<><img className="photo" src={urls[photo.asset_id]} alt={first.event_name}/><button className="button secondary full" disabled={busy===photo.asset_id} onClick={()=>void openHd(photo.asset_id)}><Eye size={17}/>{en?"View HD":"查看高清"}</button></>:<div className="photo-frame-preview"><span>{en?"Loading protected preview…":"正在加载受保护预览…"}</span></div>}<button className="text-button full" disabled={busy===photo.asset_id} onClick={()=>setDeleting(photo)}>{en?"Remove from my album":"移出我的相册"}</button></article>)}</div></section>})}
    {deleting&&<Confirm title={en?"Remove this photo from your album?":"移出我的参与赛事相册？"} description={en?"This deletes only your personal saved copy. The event source photo and other participants are not affected.":"只会删除你自己的个人相册副本，不影响赛事源照片，也不影响其他参赛者。"} onCancel={()=>setDeleting(null)} onConfirm={()=>void remove(deleting)}/>} 
  </main></>;
}
