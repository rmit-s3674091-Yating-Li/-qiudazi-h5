import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Images, LogOut, ShieldCheck } from "lucide-react";
import { Avatar, Header, ErrorNotice } from "../components/UI";
import { useAuth } from "../hooks/Auth";
import { repository } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";
import { useLanguage } from "../i18n";

export function MyProfileHome(){
  const auth=useAuth(),{profile}=auth,navigate=useNavigate();const{t,language}=useLanguage();const q=useQuery("players",()=>repository.players());const self=q.data?.find(p=>p.player_type==="self");const en=language==="en";
  const logout=async()=>{if(!window.confirm(en?"Sign out of this account and return to login?":"退出当前账号并返回登录页？"))return;try{await auth.signOut();navigate("/login",{replace:true});}catch{}};
  return <><Header title={t("me")} back={false}/><main className="page"><div className="profile-banner"><Avatar path={profile?.avatar_url} name={profile?.nickname||""} size={64}/><div><span className="eyebrow">{t("offTheCourt")}</span><h1>{profile?.nickname}</h1><p>{t("profileMotto")}</p></div></div><ErrorNotice message={q.error||auth.error} retry={q.refresh}/><Link className="card row between" to="/my-tennis-profile"><span>{t("myTennisProfile")}</span>{q.loading&&!q.data?<span className="muted small">{t("syncing")}</span>:self?<ArrowRight size={18}/>:<span className="badge">{t("pendingRecovery")}</span>}</Link><Link className="card row between" to="/my-results"><span>{t("myResults")}</span><ArrowRight size={18}/></Link><Link className="card row between" to="/my-past-albums"><span className="row"><Images size={18}/>{en?"My event album":"参与赛事相册"}</span><ArrowRight size={18}/></Link><Link className="card row between" to="/partner-invites"><span>{t("partnerInviteHistory")}</span><ArrowRight size={18}/></Link><Link className="card row between" to="/privacy"><span>{t("settings")}</span><ArrowRight size={18}/></Link><button className="card row between profile-menu-button" type="button" disabled={auth.busy} onClick={logout}><span className="row"><LogOut size={18}/>{en?"Switch account / Sign out":"切换账号 / 退出登录"}</span><ArrowRight size={18}/></button><div className="notice"><ShieldCheck size={20}/><p>{t("testIdentityNotice")}</p></div></main></>;
}
