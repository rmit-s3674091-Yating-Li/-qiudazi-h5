import { useEffect, useRef, useState } from "react";
import { parseAdminAuditPage } from "../domain/PlatformAdminAuditHistory";
import type { AuditCursor, AuditRow } from "../domain/PlatformAdminAuditHistory";
import { supabase } from "../repositories/supabase";

/** Read-only audit browser. The Edge RPC reauthorizes every page; UI role is not a security boundary. */
export function PlatformAdminAuditHistory({ userId, en }: { userId: string; en: boolean }) {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [cursor, setCursor] = useState<AuditCursor | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);

  async function loadPage(before: AuditCursor | null, reset: boolean, epoch: number) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (reset) setState("loading");
    setBusy(true);
    setPageError(false);
    try {
      if (!supabase) throw new Error("AUDIT_UNAVAILABLE");
      const { data, error } = await supabase.functions.invoke("platform-admin-audit", {
        body: { page_size: 20, ...(before ? { before } : {}) },
      });
      if (error) throw new Error("AUDIT_UNAVAILABLE");
      if (generation.current !== epoch) return;
      const priorIds = reset ? new Set<string>() : new Set(items.map((row) => row.id));
      const page = parseAdminAuditPage(data, before, priorIds);
      if (!page) throw new Error("INVALID_AUDIT_RESPONSE");
      // Invalid/overlapping pages fail closed instead of being silently deduplicated.
      setItems((previous) => reset ? page.items : [...previous, ...page.items]);
      setCursor(page.nextCursor);
      setState("ready");
    } catch {
      if (generation.current !== epoch) return;
      // Any failed page may indicate revoked admin access: hide all prior rows.
      setItems([]);
      setCursor(null);
      setState("failed");
      setPageError(true);
    } finally {
      if (generation.current === epoch) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    const epoch = ++generation.current;
    inFlight.current = false;
    setItems([]);
    setCursor(null);
    void loadPage(null, true, epoch);
    return () => { generation.current++; };
  }, [userId]);

  const unavailable = en ? "Audit history could not be loaded. Please try again." : "暂时无法读取操作审计记录，请重试。";
  return <div>
    <p className="muted small">{en ? "Read-only history. Every page is authorized by the server." : "只读审计记录，每次翻页均由服务端重新核验权限。"}</p>
    {state === "loading" && <p role="status">{en ? "Loading audit history…" : "正在读取审计记录…"}</p>}
    {pageError && <p role="alert" className="error">{unavailable}</p>}
    {state === "failed" && <button type="button" className="secondary" disabled={busy}
      onClick={() => void loadPage(null, true, generation.current)}>{en ? "Retry" : "重试"}</button>}
    {state === "ready" && <>
      {items.length === 0 && <p className="muted small">{en ? "No audit records found." : "暂无审计记录。"}</p>}
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => <li key={item.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0", overflowWrap: "anywhere" }}>
          <strong>{item.action}</strong> <span className="badge">{item.risk_level}</span>
          <p className="small muted"><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(en ? "en-US" : "zh-CN")}</time></p>
          <p className="small">{en ? "Target" : "对象"}: {item.target_kind} · {item.target_id}</p>
          <p className="small">{en ? "Reason" : "原因"}: {item.reason}</p>
          <p className="small muted">{en ? "Actor" : "操作人"}: {item.actor_auth_user_id}</p>
        </li>)}
      </ol>
      {cursor && <button type="button" className="secondary" disabled={busy}
        onClick={() => void loadPage(cursor, false, generation.current)}>{busy ? (en ? "Loading…" : "加载中…") : (en ? "Load more" : "加载更多")}</button>}
      {!cursor && items.length > 0 && <p className="muted small">{en ? "End of audit history." : "已显示全部审计记录。"}</p>}
      <button type="button" className="text-button" disabled={busy}
        onClick={() => void loadPage(null, true, generation.current)}>{en ? "Refresh history" : "刷新记录"}</button>
    </>}
  </div>;
}
