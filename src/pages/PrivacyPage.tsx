import { useCallback, useEffect, useState } from "react";
import { Header, ErrorNotice, Loading, Confirm } from "../components/UI";
import { ProtectedEventPhoto } from "../components/ProtectedEventPhoto";
import { explainError, rpc, supabase } from "../repositories/supabase";
import { useLanguage } from "../i18n";

type Prefs={avatar_visible:boolean;level_visible:boolean;city_visible:boolean;play_times_visible:boolean;play_preference_visible:boolean;allow_event_invites:boolean;allow_doubles_invites:boolean};
type ManagedPhoto={event_id:string;event_name:string;watermarked_url:string;uploaded_at:string;version:number};
const defaults:Prefs={avatar_visible:true,level_visible:true,city_visible:true,play_times_visible:true,play_preference_visible:true,allow_event_invites:true,allow_doubles_invites:true};

export function PrivacyPage(){
  const{language,setLanguage,t}=useLanguage();
  const[prefs,setPrefs]=useState<Prefs|null>(null),[photos,setPhotos]=useState<ManagedPhoto[]|null>(null),[busy,setBusy]=useState(false),[deleting,setDeleting]=useState<ManagedPhoto|null>(null),[error,setError]=useState(""),[saved,setSaved]=useState(false);
  const loadPhotos=useCallback(async()=>{try{setPhotos(await rpc<ManagedPhoto[]>("list_my_event_photos"));}catch(e){setError(explainError(e));}},[]);
  useEffect(()=>{rpc<Prefs>("get_my_preferences").then(p=>setPrefs({...defaults,...p})).catch(e=>setError(explainError(e)));void loadPhotos();},[loadPhotos]);
  function toggle(k:keyof Prefs){setPrefs(p=>p?{...p,[k]:!p[k]}:p);setSaved(false);}
  async function save(){if(!prefs)return;setBusy(true);setError("");try{const p=await rpc<Prefs>("save_my_preferences",{p_settings:prefs});setPrefs({...defaults,...p});setSaved(true);}catch(e){setError(explainError(e));}finally{setBusy(false);}}
  async function removePhoto(photo:ManagedPhoto){
    setDeleting(null);setBusy(true);setError("");
    try{
      const {error:invokeError}=await supabase!.functions.invoke("photo-management",{body:{action:"delete",event_id:photo.event_id,version:photo.version}});
      if(invokeError)throw invokeError;
      await loadPhotos();
    }catch(e){setError(explainError(e));}
    finally{setBusy(false);}
  }
  return <><Header title={t("settings")}/><main className="page">
    <span className="eyebrow">{t("privacy")}</span><h1>{t("settings")}</h1>
    <section className="settings-section"><h2>{t("language")}</h2><div className="segmented"><button className={language==="zh-CN"?"active":""} onClick={()=>setLanguage("zh-CN")}>简体中文</button><button className={language==="en"?"active":""} onClick={()=>setLanguage("en")}>English</button></div></section>
    {!prefs&&!error&&<Loading/>}<ErrorNotice message={error}/>
    {prefs&&<><section className="settings-section"><h2>{t("profileVisibility")}</h2><p className="muted small">{t("visibleHint")}</p>{([["avatar_visible","avatar"],["level_visible","level"],["city_visible","city"],["play_times_visible","playTimes"],["play_preference_visible","playPreference"]] as [keyof Prefs,Parameters<typeof t>[0]][]).map(([k,label])=><label className="setting-row" key={k}><span>{t(label)}</span><input type="checkbox" checked={prefs[k]} onChange={()=>toggle(k)}/></label>)}</section><section className="settings-section"><h2>{t("invites")}</h2><label className="setting-row"><span>{t("eventInvites")}</span><input type="checkbox" checked={prefs.allow_event_invites} onChange={()=>toggle("allow_event_invites")}/></label><label className="setting-row"><span>{t("doublesInvites")}</span><input type="checkbox" checked={prefs.allow_doubles_invites} onChange={()=>toggle("allow_doubles_invites")}/></label></section><button className="full" disabled={busy} onClick={save}>{busy?"…":saved?t("saved"):t("save")}</button></>}
    <section className="settings-section"><h2>{language==="en"?"Organizer photo management":"组织者照片管理"}</h2><p className="muted small">{language==="en"?"Only photos from events you created appear here. Removing a photo hides it from the event page but keeps the protected original and preview in participant history.":"这里只有你创建的赛事照片。移除后赛事页不再展示，但受保护原图和水印预览会继续保留在实际参赛者的历史相册中。"}</p>{photos===null?<Loading/>:photos.length===0?<div className="notice">{language==="en"?"No event photos to manage yet.":"暂时没有可管理的赛事照片。"}</div>:photos.map(photo=><article className="card" key={photo.event_id}><h3>{photo.event_name}</h3><ProtectedEventPhoto previewPath={photo.watermarked_url} alt={language==="en"?`${photo.event_name} protected event-photo preview`:`${photo.event_name}受保护赛事照片预览`} allowOriginal={false}/><p className="muted small">{new Date(photo.uploaded_at).toLocaleDateString(language==="en"?"en-US":"zh-CN")}</p><button className="button secondary full" disabled={busy} onClick={()=>setDeleting(photo)}>{language==="en"?"Remove from event page":"从赛事相册移除"}</button></article>)}</section>
    <div className="notice">{t("testPrivacy")}</div>
    {deleting&&<Confirm title={language==="en"?"Remove this photo from the event page?":"从赛事相册移除这张照片？"} description={language==="en"?"The event page will stop showing this photo. The protected original and watermarked preview stay stored for actual participants' past-event albums.":"赛事页面将不再展示这张照片；受保护高清原图和水印预览仍会保留，供实际参赛者在过往比赛相册中查看。"} onCancel={()=>setDeleting(null)} onConfirm={()=>void removePhoto(deleting)}/>} 
  </main></>;
}
