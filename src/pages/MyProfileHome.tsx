import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Avatar, Header, ErrorNotice } from "../components/UI";
import { useAuth } from "../hooks/Auth";
import { repository } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";

export function MyProfileHome(){
  const{profile}=useAuth();const q=useQuery("players",()=>repository.players());const self=q.data?.find(p=>p.player_type==="self");
  return <><Header title="我的" back={false}/><main className="page"><div className="profile-banner"><Avatar path={profile?.avatar_url} name={profile?.nickname||""} size={64}/><div><span className="eyebrow">OFF THE COURT</span><h1>{profile?.nickname}</h1><p>每一场球，都值得认真对待。</p></div></div><ErrorNotice message={q.error} retry={q.refresh}/><Link className="card row between" to="/my-tennis-profile"><span>我的打球档案</span>{q.loading&&!q.data?<span className="muted small">同步中</span>:self?<ArrowRight size={18}/>:<span className="badge">待恢复</span>}</Link><Link className="card row between" to="/my-results"><span>我的战绩</span><ArrowRight size={18}/></Link><Link className="card row between" to="/partner-invites"><span>球搭子邀请记录</span><ArrowRight size={18}/></Link><Link className="card row between" to="/privacy"><span>设置与隐私</span><ArrowRight size={18}/></Link><div className="notice"><ShieldCheck size={20}/><p>当前为受控测试版，昵称仅用于识别测试身份。</p></div></main></>;
}
