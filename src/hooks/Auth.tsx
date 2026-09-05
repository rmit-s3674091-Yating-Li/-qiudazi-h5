import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "../domain/types";
import { clearIdentityClientStorage, clearLoginRequired, isLoginRequired, markLoginRequired, PROFILE_CACHE_KEY, GUEST_CREDENTIALS_KEY } from "../domain/IdentitySession";
import { repository, supabase, explainError } from "../repositories/supabase";
import { clearQueryCache } from "./useQuery";
import { useLanguage } from "../i18n";

interface AuthState { session: Session | null; profile: Profile | null; ready: boolean; busy: boolean; error: string; loginRequired: boolean; start: (options?: { explicit?: boolean }) => Promise<Profile>; loginByNickname: (nickname: string) => Promise<Profile>; refresh: () => Promise<void>; signOut: () => Promise<void>; }
const AuthContext = createContext<AuthState>(null!);
export const useAuth = () => useContext(AuthContext);
const isEnglish=()=>typeof localStorage!=="undefined"&&localStorage.getItem("qiudazi-language")==="en";

function readCachedProfile(authUserId: string) { try { const raw = localStorage.getItem(PROFILE_CACHE_KEY); if (!raw) return null; const parsed = JSON.parse(raw) as { authUserId?: unknown; profile?: unknown }; if (parsed.authUserId !== authUserId || !parsed.profile || typeof parsed.profile !== "object") return null; return parsed.profile as Profile; } catch { return null; } }
function writeCachedProfile(authUserId: string, profile: Profile) { try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ authUserId, profile })); } catch {} }
function clearCachedProfile() { try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {} }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null), [profile, setProfile] = useState<Profile | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [loginRequired, setLoginRequired] = useState(() => typeof localStorage !== "undefined" && isLoginRequired(localStorage));
  const flight = useRef<Promise<Profile> | null>(null);
  async function refresh() { if (!supabase) return; const { data, error } = await supabase.auth.getSession(); if (error) throw error; setSession(data.session); if (data.session) { const p = await repository.profile(); setProfile(p); writeCachedProfile(data.session.user.id, p); } else { setProfile(null); clearCachedProfile(); } }
  async function signOut() {
    if (!supabase) throw new Error(isEnglish()?"Supabase is not configured yet.":"Supabase尚未配置");
    setBusy(true);setError("");
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      clearIdentityClientStorage(localStorage);markLoginRequired(localStorage);clearQueryCache();
      setSession(null);setProfile(null);setLoginRequired(true);
    } catch (e) { setError(explainError(e)); throw e; } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let active = true;
    (async () => { try { const { data, error: sessionError } = await supabase.auth.getSession(); if (sessionError) throw sessionError; if (!active) return; setSession(data.session); if (!data.session) { setProfile(null); clearCachedProfile(); return; } const cached = readCachedProfile(data.session.user.id); if (cached && active) setProfile(cached); const fresh = await repository.profile(); if (!active) return; setProfile(fresh); writeCachedProfile(data.session.user.id, fresh); setError(""); } catch (e) { if (active) setError(explainError(e)); } finally { if (active) setReady(true); } })();
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (!next) { setProfile(null); clearCachedProfile(); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  function start(options?: { explicit?: boolean }) {
    if (flight.current) return flight.current; setBusy(true); setError("");
    flight.current = (async () => {
      if (!supabase) throw new Error(isEnglish()?"Supabase is not configured yet.":"Supabase尚未配置");
      const explicit=options?.explicit===true;
      const { data } = await supabase.auth.getSession(); let s = data.session;
      if (!s && !explicit && isLoginRequired(localStorage)) throw new Error(isEnglish()?"Please sign in to continue.":"请先登录后继续");
      if (!s) {
        let credentials: { email: string; password: string } | null = null;
        try { const raw = localStorage.getItem(GUEST_CREDENTIALS_KEY); if (raw) { const saved = JSON.parse(raw) as { email?: unknown; password?: unknown }; if (typeof saved.email === "string" && typeof saved.password === "string") credentials = { email: saved.email, password: saved.password }; } } catch {}
        if (credentials) { const signInResult = await supabase.auth.signInWithPassword(credentials); if (!signInResult.error) s = signInResult.data.session; else { localStorage.removeItem(GUEST_CREDENTIALS_KEY); credentials = null; } }
        if (!s) { const provision = await supabase.functions.invoke("guest-session", { body: {} }); if (provision.error) throw provision.error; const data = provision.data as { email?: unknown; password?: unknown; error?: unknown } | null; if (!data || typeof data.email !== "string" || typeof data.password !== "string") throw new Error(typeof data?.error === "string" ? data.error : (isEnglish()?"Could not create a guest test identity.":"游客身份创建失败")); credentials = { email: data.email, password: data.password }; localStorage.setItem(GUEST_CREDENTIALS_KEY, JSON.stringify(credentials)); const signInResult = await supabase.auth.signInWithPassword(credentials); if (signInResult.error) throw signInResult.error; s = signInResult.data.session; }
        if (!s) throw new Error(isEnglish()?"Could not create the guest test identity. Refresh the page and try again.":"游客身份创建失败，请刷新页面重试");
      }
      setSession(s); const p = await repository.profile(); setProfile(p); writeCachedProfile(s.user.id, p); clearLoginRequired(localStorage);setLoginRequired(false); return p;
    })().catch((e) => { setError(explainError(e)); throw e; }).finally(() => { setBusy(false); flight.current = null; });
    return flight.current;
  }
  async function loginByNickname(nickname:string){
    if(!supabase)throw new Error(isEnglish()?"Supabase is not configured yet.":"Supabase尚未配置");
    setBusy(true);setError("");
    try{
      const exchange=await supabase.functions.invoke("test-identity-exchange",{body:{nickname}});
      if(exchange.error)throw exchange.error;
      const payload=exchange.data as {token_hash?:unknown;otp_type?:unknown;error?:unknown}|null;
      if(!payload||typeof payload.token_hash!=="string"||payload.otp_type!=="email")throw new Error(typeof payload?.error==="string"?payload.error:(isEnglish()?"Nickname sign-in failed.":"昵称登录失败"));
      const verified=await supabase.auth.verifyOtp({token_hash:payload.token_hash,type:"email"});
      if(verified.error||!verified.data.session)throw verified.error||new Error(isEnglish()?"Nickname sign-in failed.":"昵称登录失败");
      clearQueryCache();clearIdentityClientStorage(localStorage);
      const p=await repository.profile();
      setSession(verified.data.session);setProfile(p);writeCachedProfile(verified.data.session.user.id,p);clearLoginRequired(localStorage);setLoginRequired(false);return p;
    }catch(e){setSession(null);setProfile(null);clearCachedProfile();markLoginRequired(localStorage);setLoginRequired(true);setError(explainError(e));throw e;}finally{setBusy(false);}
  }
  return <AuthContext.Provider value={{ session, profile, ready, busy, error, loginRequired, start, loginByNickname, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function safeNext(path: string | null) { return path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && !path.startsWith("/profile") ? path : "/events"; }

export function IdentityGate({ children }: { children: ReactNode }) {
  const auth = useAuth(), location = useLocation(), navigate = useNavigate(); const{language}=useLanguage();const en=language==="en";
  useEffect(() => { if (!auth.ready || auth.busy || auth.error || auth.loginRequired) return; if (auth.profile?.profile_status === "completed") return; auth.start().then((p) => { if (p.profile_status !== "completed") navigate("/profile?next=" + encodeURIComponent(location.pathname + location.search), { replace: true }); }).catch(() => {}); }, [auth.ready, auth.profile?.id, auth.loginRequired, location.pathname]);
  if(auth.ready&&auth.loginRequired)return <Navigate to={`/login?next=${encodeURIComponent(location.pathname+location.search)}`} replace/>;
  if (auth.ready && auth.profile?.profile_status === "completed") return <>{children}</>;
  return <section className="empty"><h2>{en?"Restoring your Qiu Dazi identity":"正在恢复你的球搭子身份"}</h2><p>{auth.error || (en?"Connecting your previous events and partner records…":"正在连接之前的赛事和球搭子记录…")}</p>{auth.error && <button onClick={() => auth.start().then((p) => { if (p.profile_status !== "completed") navigate("/profile?next=" + encodeURIComponent(location.pathname + location.search)); }).catch(() => {})}>{en?"Retry connection":"重试连接"}</button>}</section>;
}
