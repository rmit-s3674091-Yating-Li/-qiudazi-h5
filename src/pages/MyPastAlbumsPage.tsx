import { useCallback, useEffect, useState } from "react";
import { Header, ErrorNotice, Loading, Empty } from "../components/UI";
import { ProtectedEventPhoto } from "../components/ProtectedEventPhoto";
import { explainError, rpc } from "../repositories/supabase";
import { useLanguage } from "../i18n";

type AlbumPhoto={asset_id:string;event_id:string;event_name:string;event_date:string|null;watermarked_url:string;original_url:string;uploaded_at:string;is_current_event_photo:boolean;visibility:"private"|"partners"};

export function MyPastAlbumsPage(){
  const{language}=useLanguage();const en=language==="en";
  const[rows,setRows]=useState<AlbumPhoto[]|null>(null),[busy,setBusy]=useState<string>(),[error,setError]=useState("");
  const load=useCallback(async()=>{try{setRows(await rpc<AlbumPhoto[]>("list_my_past_event_albums"));}catch(e){setError(explainError(e));}},[]);
  useEffect(()=>{void load();},[load]);
  async function setVisibility(eventId:string,visibility:"private"|"partners"){
    setBusy(eventId);setError("");try{await rpc("set_my_event_album_visibility",{p_event_id:eventId,p_visibility:visibility});await load();}catch(e){setError(explainError(e));}finally{setBusy(undefined);}
  }
  const events=[...new Set((rows||[]).map(r=>r.event_id))];
  return <><Header title={en?"Past event albums":"过往比赛相册"}/><main className="page">
    <span className="eyebrow">{en?"YOUR MATCH MEMORIES":"我的比赛记忆"}</span>
    <h1>{en?"Past event albums":"过往比赛相册"}</h1>
    <p className="muted">{en?"Photos from events you actually played in stay in your history even if the organizer removes them from the event page. Albums are private by default.":"你实际参加过的赛事照片会保留在历史相册中；即使组织者从赛事页移除，也不会从你的历史中消失。相册默认仅自己可见。"}</p>
    <ErrorNotice message={error}/>{rows===null?<Loading/>:rows.length===0?<Empty title={en?"No past event photos yet":"还没有过往比赛照片"}><p>{en?"When an organizer uploads a photo for an event you played in, it will appear here.":"你实际参赛的赛事由组织者上传合影后，会出现在这里。"}</p></Empty>:events.map(eventId=>{const photos=rows.filter(r=>r.event_id===eventId);const first=photos[0];return <section className="settings-section" key={eventId}><div className="section-heading"><div><h2>{first.event_name}</h2><p className="muted small">{first.event_date||new Date(first.uploaded_at).toLocaleDateString(en?"en-US":"zh-CN")}</p></div></div><div className="segmented"><button disabled={busy===eventId} className={first.visibility==="private"?"active":""} onClick={()=>void setVisibility(eventId,"private")}>{en?"Only me":"仅自己可见"}</button><button disabled={busy===eventId} className={first.visibility==="partners"?"active":""} onClick={()=>void setVisibility(eventId,"partners")}>{en?"Partners":"搭子可见"}</button></div><p className="muted small">{first.visibility==="partners"?(en?"Your established tennis partners can see the protected watermarked preview. HD originals remain limited to the organizer and actual participants.":"已建立关系的球搭子可以看到受保护水印预览；高清原图仍只对组织者和实际参赛者开放。"):(en?"This album is not shown on your partner profile.":"该相册不会展示在你的球搭子档案中。")}</p><div className="stack">{photos.map(photo=><article className="card" key={photo.asset_id}><ProtectedEventPhoto previewPath={photo.watermarked_url} originalPath={photo.original_url} alt={en?`${photo.event_name} protected event photo`:`${photo.event_name}受保护赛事照片`}/>{!photo.is_current_event_photo&&<p className="muted small">{en?"Removed from the event page by the organizer · kept in participant history":"组织者已从赛事页移除 · 仍保留在参赛历史相册"}</p>}</article>)}</div></section>})}
  </main></>;
}
