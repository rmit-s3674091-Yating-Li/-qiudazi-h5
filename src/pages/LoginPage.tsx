import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Brand } from "../components/UI";
import { safeNext, useAuth } from "../hooks/Auth";
import { useLanguage } from "../i18n";

export function LoginPage(){
  const auth=useAuth(),navigate=useNavigate(),[params]=useSearchParams();const{language}=useLanguage();const en=language==="en";const next=safeNext(params.get("next"));
  if(auth.ready&&!auth.loginRequired&&auth.profile?.profile_status==="completed")return <Navigate to={next} replace/>;
  const create=async()=>{try{const p=await auth.start({explicit:true});navigate(p.profile_status==="completed"?next:`/profile?next=${encodeURIComponent(next)}`,{replace:true});}catch{}};
  return <main className="app-shell setup page"><Brand/><span className="eyebrow">{en?"Test identity":"测试身份"}</span><h1>{en?"Sign in to Qiu Dazi":"登录球搭子"}</h1><p>{en?"Account switching now uses a real sign-out boundary. Existing nickname recovery will be connected through the controlled test identity exchange next.":"账号切换现在会先真实退出当前会话。已有昵称恢复将通过受控测试身份交换链继续接入。"}</p>{auth.error&&<p className="error">{auth.error}</p>}<button className="primary" disabled={auth.busy} onClick={create}>{auth.busy?(en?"Connecting…":"连接中…"):(en?"Create a new test nickname":"创建新的测试昵称")}</button></main>;
}
