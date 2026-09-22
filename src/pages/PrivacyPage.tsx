import { useEffect, useState } from "react";
import { Header, ErrorNotice, Loading } from "../components/UI";
import { explainError, rpc } from "../repositories/supabase";
import { useLanguage } from "../i18n";

type Prefs={avatar_visible:boolean;level_visible:boolean;city_visible:boolean;play_times_visible:boolean;play_preference_visible:boolean;allow_event_invites:boolean;allow_doubles_invites:boolean;participant_album_visibility:"private"|"partners"};
const defaults:Prefs={avatar_visible:true,level_visible:true,city_visible:true,play_times_visible:true,play_preference_visible:true,allow_event_invites:true,allow_doubles_invites:true,participant_album_visibility:"private"};
function normalizePrefs(value:Partial<Prefs>|null|undefined):Prefs{return{
  avatar_visible:value?.avatar_visible??defaults.avatar_visible,
  level_visible:value?.level_visible??defaults.level_visible,
  city_visible:value?.city_visible??defaults.city_visible,
  play_times_visible:value?.play_times_visible??defaults.play_times_visible,
  play_preference_visible:value?.play_preference_visible??defaults.play_preference_visible,
  allow_event_invites:value?.allow_event_invites??defaults.allow_event_invites,
  allow_doubles_invites:value?.allow_doubles_invites??defaults.allow_doubles_invites,
  participant_album_visibility:value?.participant_album_visibility??defaults.participant_album_visibility,
};}

export function PrivacyPage(){
  const{language,setLanguage,t}=useLanguage();const en=language==="en";
  const[prefs,setPrefs]=useState<Prefs|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
  useEffect(()=>{rpc<Partial<Prefs>>("get_my_preferences").then(p=>setPrefs(normalizePrefs(p))).catch(e=>setError(explainError(e)));},[]);
  function toggle(k:keyof Prefs){setPrefs(p=>p?{...p,[k]:!p[k]} as Prefs:p);setSaved(false);}
  function setAlbumVisibility(value:"private"|"partners"){setPrefs(p=>p?{...p,participant_album_visibility:value}:p);setSaved(false);}
  async function save(){if(!prefs)return;setBusy(true);setError("");try{const payload=normalizePrefs(prefs);const p=await rpc<Partial<Prefs>>("save_my_preferences",{p_settings:payload});setPrefs(normalizePrefs(p));setSaved(true);}catch(e){setError(explainError(e));}finally{setBusy(false);}}
  return <><Header title={t("settings")} backTo="/me"/><main className="page">
    <span className="eyebrow">{t("privacy")}</span><h1>{t("settings")}</h1>
    <section className="settings-section"><h2>{t("language")}</h2><div className="segmented"><button className={language==="zh-CN"?"active":""} onClick={()=>setLanguage("zh-CN")}>简体中文</button><button className={language==="en"?"active":""} onClick={()=>setLanguage("en")}>English</button></div></section>
    {!prefs&&!error&&<Loading/>}<ErrorNotice message={error}/>
    {prefs&&<>
      <section className="settings-section"><h2>{t("profileVisibility")}</h2><p className="muted small">{t("visibleHint")}</p>{([["avatar_visible","avatar"],["level_visible","level"],["city_visible","city"],["play_times_visible","playTimes"],["play_preference_visible","playPreference"]] as [keyof Prefs,Parameters<typeof t>[0]][]).map(([k,label])=><label className="setting-row" key={k}><span>{t(label)}</span><input type="checkbox" checked={Boolean(prefs[k])} onChange={()=>toggle(k)}/></label>)}</section>
      <section className="settings-section"><h2>{t("invites")}</h2><label className="setting-row"><span>{t("eventInvites")}</span><input type="checkbox" checked={prefs.allow_event_invites} onChange={()=>toggle("allow_event_invites")}/></label><label className="setting-row"><span>{t("doublesInvites")}</span><input type="checkbox" checked={prefs.allow_doubles_invites} onChange={()=>toggle("allow_doubles_invites")}/></label></section>
      <section className="settings-section"><h2>{en?"Event album visibility":"参与赛事相册可见范围"}</h2><p className="muted small">{en?"This controls your personal event album only. Event source photos are managed by each event organizer on the event page.":"这里只控制你自己的参与赛事相册。赛事源照片由各场赛事创建人在赛事页面中管理。"}</p><div className="segmented"><button className={prefs.participant_album_visibility==="private"?"active":""} onClick={()=>setAlbumVisibility("private")}>{en?"Only me":"仅自己可见"}</button><button className={prefs.participant_album_visibility==="partners"?"active":""} onClick={()=>setAlbumVisibility("partners")}>{en?"Partners":"搭子可见"}</button></div><p className="muted small">{prefs.participant_album_visibility==="partners"?(en?"Accepted tennis partners can see protected watermarked previews. HD originals stay private to you.":"已建立关系的球搭子可以看到受保护水印预览，但不会获得你的高清个人副本。"):(en?"Your personal event album is not shown to partners.":"你的参与赛事相册不会展示给球搭子。")}</p></section>
      <button className="full" disabled={busy} onClick={save}>{busy?"…":saved?t("saved"):t("save")}</button>
    </>}
    <div className="notice">{t("testPrivacy")}</div>
  </main></>;
}
