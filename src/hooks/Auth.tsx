import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "../domain/types";
import { repository, supabase, explainError } from "../repositories/supabase";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  ready: boolean;
  busy: boolean;
  error: string;
  start: () => Promise<Profile>;
  refresh: () => Promise<void>;
}

const PROFILE_CACHE_KEY = "qiudazi_profile_cache_v2";
const AuthContext = createContext<AuthState>(null!);
export const useAuth = () => useContext(AuthContext);

function readCachedProfile(authUserId: string) {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { authUserId?: unknown; profile?: unknown };
    if (parsed.authUserId !== authUserId || !parsed.profile || typeof parsed.profile !== "object") return null;
    return parsed.profile as Profile;
  } catch {
    return null;
  }
}

function writeCachedProfile(authUserId: string, profile: Profile) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ authUserId, profile }));
  } catch {}
}

function clearCachedProfile() {
  try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const flight = useRef<Promise<Profile> | null>(null);

  async function refresh() {
    if (!supabase) return;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    setSession(data.session);
    if (data.session) {
      const p = await repository.profile();
      setProfile(p);
      writeCachedProfile(data.session.user.id, p);
    } else {
      setProfile(null);
      clearCachedProfile();
    }
  }

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!active) return;
        setSession(data.session);

        if (!data.session) {
          setProfile(null);
          clearCachedProfile();
          return;
        }

        const cached = readCachedProfile(data.session.user.id);
        if (cached && active) {
          // Cached identity may be used as a visual placeholder, but must never make
          // identity-sensitive routes ready before the server resolves the canonical Profile.
          setProfile(cached);
        }

        const fresh = await repository.profile();
        if (!active) return;
        setProfile(fresh);
        writeCachedProfile(data.session.user.id, fresh);
        setError("");
      } catch (e) {
        if (active) setError(explainError(e));
      } finally {
        if (active) setReady(true);
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        clearCachedProfile();
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  function start() {
    if (flight.current) return flight.current;
    setBusy(true);
    setError("");
    flight.current = (async () => {
      if (!supabase) throw new Error("Supabase尚未配置");
      const { data } = await supabase.auth.getSession();
      let s = data.session;
      if (!s) {
        const storageKey = "qiudazi_guest_credentials_v3";
        let credentials: { email: string; password: string } | null = null;
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const saved = JSON.parse(raw) as { email?: unknown; password?: unknown };
            if (typeof saved.email === "string" && typeof saved.password === "string") credentials = { email: saved.email, password: saved.password };
          }
        } catch {}

        if (credentials) {
          const signInResult = await supabase.auth.signInWithPassword(credentials);
          if (!signInResult.error) s = signInResult.data.session;
          else { localStorage.removeItem(storageKey); credentials = null; }
        }

        if (!s) {
          const provision = await supabase.functions.invoke("guest-session", { body: {} });
          if (provision.error) throw provision.error;
          const data = provision.data as { email?: unknown; password?: unknown; error?: unknown } | null;
          if (!data || typeof data.email !== "string" || typeof data.password !== "string") throw new Error(typeof data?.error === "string" ? data.error : "游客身份创建失败");
          credentials = { email: data.email, password: data.password };
          localStorage.setItem(storageKey, JSON.stringify(credentials));
          const signInResult = await supabase.auth.signInWithPassword(credentials);
          if (signInResult.error) throw signInResult.error;
          s = signInResult.data.session;
        }
        if (!s) throw new Error("游客身份创建失败，请刷新页面重试");
      }
      setSession(s);
      const p = await repository.profile();
      setProfile(p);
      writeCachedProfile(s.user.id, p);
      return p;
    })()
      .catch((e) => {
        setError(explainError(e));
        throw e;
      })
      .finally(() => {
        setBusy(false);
        flight.current = null;
      });
    return flight.current;
  }

  return (
    <AuthContext.Provider value={{ session, profile, ready, busy, error, start, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function safeNext(path: string | null) {
  return path &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !path.startsWith("/profile")
    ? path
    : "/events";
}

export function IdentityGate({ children }: { children: ReactNode }) {
  const auth = useAuth(),
    location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    if (!auth.ready || auth.busy || auth.error) return;
    if (auth.profile?.profile_status === "completed") return;
    auth
      .start()
      .then((p) => {
        if (p.profile_status !== "completed")
          navigate(
            "/profile?next=" + encodeURIComponent(location.pathname + location.search),
            { replace: true },
          );
      })
      .catch(() => {});
  }, [auth.ready, auth.profile?.id, location.pathname]);
  if (auth.ready && auth.profile?.profile_status === "completed") return <>{children}</>;
  return (
    <section className="empty">
      <h2>正在恢复你的球搭子身份</h2>
      <p>{auth.error || "正在连接之前的赛事和球搭子记录…"}</p>
      {auth.error && (
        <button
          onClick={() =>
            auth
              .start()
              .then((p) => {
                if (p.profile_status !== "completed")
                  navigate(
                    "/profile?next=" + encodeURIComponent(location.pathname + location.search),
                  );
              })
              .catch(() => {})
          }
        >
          重试连接
        </button>
      )}
    </section>
  );
}
