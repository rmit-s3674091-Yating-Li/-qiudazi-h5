import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Brand } from "../components/UI";
import { safeNext, useAuth } from "../hooks/Auth";
import { useLanguage } from "../i18n";

export function LoginPage(){
  const auth=useAuth(),navigate=useNavigate(),[params]=useSearchParams();const{language}=useLanguage();const en=language==="en";const next=safeNext(params.get("next"));const[nickname,setNickname]=useState("");
  if(auth.ready&&!auth.loginRequired&&auth.profile?.profile_status==="completed")return <Navigate to={next} replace/>;
  const create=async()=>{try{const p=await auth.start({explicit:true});navigate(p.profile_status==="completed"?next:`/profile?next=${encodeURIComponent(next)}`,{replace:true});}catch{}};
  const login=async()=>{const value=nickname.trim();if(!value)return;try{const p=await auth.loginByNickname(value);navigate(p.profile_status==="completed"?next:`/profile?next=${encodeURIComponent(next)}`,{replace:true});}catch{}};
  return <main className="app-shell setup page"><Brand/><span className="eyebrow">{en?"Test identity":"测试身份"}</span><h1>{en?"Sign in to Qiu Dazi":"登录球搭子"}</h1><p>{en?"Use an existing unique nickname to restore that test account, or create a new nickname for first use.":"输入已有唯一昵称恢复对应测试账号；首次使用也可以创建新昵称。"}</p>{auth.error&&<p className="error">{auth.error}</p>}<label><span>{en?"Existing nickname":"已有昵称"}</span><input value={nickname} maxLength={80} autoComplete="username" onChange={e=>setNickname(e.target.value)} placeholder={en?"Enter nickname":"输入昵称"}/></label><button className="primary" disabled={auth.busy||!nickname.trim()} onClick={login}>{auth.busy?(en?"Signing in…":"登录中…"):(en?"Sign in with nickname":"使用昵称登录")}</button><div className="divider"/><button disabled={auth.busy} onClick={create}>{en?"Create a new test nickname":"创建新的测试昵称"}</button><p className="muted small center">{en?<>Before continuing, please read our <Link to="/privacy-notice">usage & privacy notice</Link>.</>:<>继续使用前，请阅读<Link to="/privacy-notice">《使用与隐私说明（测试版）》</Link>。</>}</p></main>;
}
