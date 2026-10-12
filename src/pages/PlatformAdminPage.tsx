import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "../components/UI";
import { useAuth } from "../hooks/Auth";
import { useLanguage } from "../i18n";
import { rpc } from "../repositories/supabase";

type AdminRole = "reviewer" | "operator" | "super_admin";
type AccessStatus = "loading" | "allowed" | "denied" | "unavailable";
type Access = { userId: string | null; status: AccessStatus; role: AdminRole | null };

const AREAS = [
  ["用户管理", "Users"],
  ["赛事管理", "Events"],
  ["比分与结果异常", "Score and result exceptions"],
  ["照片与内容治理", "Photos and content moderation"],
  ["场馆与商业机构", "Venues and commercial organizations"],
  ["举报与反馈", "Reports and feedback"],
  ["操作审计", "Operation audit"],
] as const;

function isAdminRole(value: unknown): value is AdminRole {
  return value === "reviewer" || value === "operator" || value === "super_admin";
}

/** Read-only, fail-closed shell. Future mutations must independently authorize server-side. */
export function PlatformAdminPage() {
  const { ready, session } = useAuth();
  const { language } = useLanguage();
  const en = language === "en";
  const userId = session?.user.id ?? null;
  const [access, setAccess] = useState<Access>({ userId: null, status: "loading", role: null });

  useEffect(() => {
    if (!ready || !userId) return;
    let cancelled = false;
    setAccess({ userId, status: "loading", role: null });
    rpc<string | null>("platform_admin_my_role")
      .then((role) => {
        if (cancelled) return;
        setAccess({ userId, status: isAdminRole(role) ? "allowed" : "denied", role: isAdminRole(role) ? role : null });
      })
      .catch(() => {
        if (!cancelled) setAccess({ userId, status: "unavailable", role: null });
      });
    return () => { cancelled = true; };
  }, [ready, userId]);

  const status = !ready ? "loading" : !userId ? "signed_out" : access.userId !== userId ? "loading" : access.status;
  return <>
    <Header title={en ? "Platform administration" : "平台管理"} backTo="/me" />
    <main className="page">
      <h1>{en ? "Platform administration" : "平台管理"}</h1>
      {status === "loading" && <p role="status">{en ? "Checking administrator access…" : "正在核验平台管理权限…"}</p>}
      {status === "signed_out" && <div className="card"><p>{en ? "Sign in before accessing platform administration." : "请先登录，再访问平台管理页面。"}</p><Link to="/login?next=%2Fplatform-admin">{en ? "Go to sign in" : "前往登录"}</Link></div>}
      {status === "denied" && <div className="card" role="alert"><p>{en ? "This account does not have platform administrator access." : "当前账号没有平台管理员权限。"}</p></div>}
      {status === "unavailable" && <div className="card" role="alert"><p>{en ? "Administrator access could not be verified. No management functions are available. Try again later." : "暂时无法核验平台管理员权限，管理功能未开放。请稍后重试。"}</p></div>}
      {status === "allowed" && <>
        <p className="muted small">{en ? `Access level: ${access.role}. This page is read-only until audited management actions are available.` : `权限级别：${access.role}。审计化管理操作上线前，此页面仅供查看模块范围。`}</p>
        {AREAS.map(([zh, english]) => <section className="card" key={zh} aria-label={en ? english : zh}>
          <h2>{en ? english : zh}</h2>
          <p className="muted small">{en ? "Not available yet · no changes can be made" : "尚未开放 · 当前不可执行修改"}</p>
        </section>)}
      </>}
    </main>
  </>;
}
