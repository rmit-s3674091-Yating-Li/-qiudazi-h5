import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Avatar, Header, ErrorNotice } from "../components/UI";
import { useAuth } from "../hooks/Auth";
import { repository } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";
import { useLanguage } from "../i18n";

export function MyProfileHome(){
  const{profile}=useAuth();const{t}=useLanguage();const q=useQuery("players",()=>repository.players());const self=q.data?.find(p=>p.player_type==="self");
  return <><Header title={t("me")} back={false}/><main className="page"><div className="profile-banner"><Avatar path={profile?.avatar_url} name={profile?.nickname||""} size={64}/><div><span className="eyebrow">{t("offTheCourt")}</span><h1>{profile?.nickname}</h1><p>{t("profileMotto")}</p></div></div><ErrorNotice message={q.error} retry={q.refresh}/><Link className="card row between" to="/my-tennis-profile"><span>{t("myTennisProfile")}</span>{q.loading&&!q.data?<span className="muted small">{t("syncing")}</span>:self?<ArrowRight size={18}/>:<span className="badge">{t("pendingRecovery")}</span>}</Link><Link className="card row between" to="/my-results"><span>{t("myResults")}</span><ArrowRight size={18}/></Link><Link className="card row between" to="/partner-invites"><span>{t("partnerInviteHistory")}</span><ArrowRight size={18}/></Link><Link className="card row between" to="/privacy"><span>{t("settings")}</span><ArrowRight size={18}/></Link><div className="notice"><ShieldCheck size={20}/><p>{t("testIdentityNotice")}</p></div></main></>;
}
