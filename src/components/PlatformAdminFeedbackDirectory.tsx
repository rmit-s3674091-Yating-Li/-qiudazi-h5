import { useEffect, useRef, useState } from "react";
import { parseAdminFeedbackPage } from "../domain/PlatformAdminFeedbackDirectory";
import type { AdminFeedbackCursor, AdminFeedbackRow, AdminFeedbackStatus } from "../domain/PlatformAdminFeedbackDirectory";
import { supabase } from "../repositories/supabase";

type Filter = "all" | AdminFeedbackStatus;
const filters: readonly Filter[] = ["all", "open", "in_review", "resolved", "dismissed"];
const statusText: Record<Filter, [string, string]> = {
  all: ["全部状态", "All statuses"],
  open: ["待处理", "Open"],
  in_review: ["审核中", "In review"],
  resolved: ["已处理", "Resolved"],
  dismissed: ["已驳回", "Dismissed"],
};
const categoryText: Record<AdminFeedbackRow["category"], [string, string]> = {
  bug: ["问题反馈", "Bug report"],
  experience: ["使用体验", "User experience"],
  accessibility: ["无障碍", "Accessibility"],
  other: ["其他", "Other"],
};

/** Read-only feedback triage; server independently reauthorizes each request. */
export function PlatformAdminFeedbackDirectory({ userId, en }: { userId: string; en: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const scope = `${userId}:${filter}`;
  const [loadedScope, setLoadedScope] = useState("");
  const [items, setItems] = useState<AdminFeedbackRow[]>([]);
  const [cursor, setCursor] = useState<AdminFeedbackCursor | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);

  async function loadPage(before: AdminFeedbackCursor | null, reset: boolean, epoch: number, selected: Filter) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (reset) {
      setItems([]);
      setCursor(null);
      setState("loading");
    }
    setBusy(true);
    try {
      if (!supabase) throw new Error("FEEDBACK_DIRECTORY_UNAVAILABLE");
      const { data, error } = await supabase.functions.invoke("platform-admin-feedback", {
        body: { page_size: 20, ...(selected === "all" ? {} : { status: selected }), ...(before ? { before } : {}) },
      });
      if (error) throw new Error("FEEDBACK_DIRECTORY_UNAVAILABLE");
      const page = parseAdminFeedbackPage(data, selected === "all" ? null : selected, 20, before);
      if (!page) throw new Error("INVALID_FEEDBACK_DIRECTORY_RESPONSE");
      if (generation.current !== epoch) return;
      if (!reset && page.items.some((row) => items.some((old) => old.id.toLowerCase() === row.id.toLowerCase()))) {
        throw new Error("FEEDBACK_DIRECTORY_PAGE_OVERLAP");
      }
      setItems((previous) => reset ? page.items : [...previous, ...page.items]);
      setCursor(page.nextCursor);
      setState("ready");
    } catch {
      if (generation.current !== epoch) return;
      setItems([]);
      setCursor(null);
      setState("failed");
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
    setState("loading");
    setLoadedScope(scope);
    void loadPage(null, true, epoch, filter);
    return () => { generation.current++; inFlight.current = false; };
  }, [userId, filter]);

  if (loadedScope !== scope) return <p role="status">{en ? "Loading feedback records…" : "正在加载反馈记录…"}</p>;
  return <div>
    <p className="muted small">{en
      ? "Read-only feedback metadata. Submitter identities and feedback messages are not displayed. Every request is reauthorized."
      : "仅查看反馈元数据，不展示提交人身份或反馈正文。每次查询均由服务端重新核验权限。"}</p>
    <label className="small" htmlFor="platform-admin-feedback-status">{en ? "Feedback status" : "反馈状态"}</label>
    <select id="platform-admin-feedback-status" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
      {filters.map((value) => <option key={value} value={value}>{statusText[value][en ? 1 : 0]}</option>)}
    </select>
    {state === "loading" && <p role="status">{en ? "Loading feedback…" : "正在读取反馈记录…"}</p>}
    {state === "failed" && <div role="alert">
      <p className="error">{en ? "Feedback unavailable. Administrator access may have changed." : "暂时无法读取反馈记录，管理员权限可能已变化。"}</p>
      <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(null, true, generation.current, filter)}>{en ? "Retry" : "重试"}</button>
    </div>}
    {state === "ready" && <>
      {items.length === 0 && <p className="muted small">{en ? "No matching feedback." : "没有符合条件的反馈记录。"}</p>}
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => <li key={item.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0", overflowWrap: "anywhere" }}>
          <strong>{categoryText[item.category][en ? 1 : 0]}</strong> <span className="badge">{statusText[item.status][en ? 1 : 0]}</span>
          <p className="small muted"><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(en ? "en-US" : "zh-CN")}</time></p>
          <p className="small muted">{en ? "Feedback ID" : "反馈 ID"}: {item.id} · {en ? "Version" : "版本"}: {item.version}</p>
        </li>)}
      </ol>
      {cursor && <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(cursor, false, generation.current, filter)}>{busy ? (en ? "Loading…" : "加载中…") : (en ? "Load more" : "加载更多")}</button>}
      <button type="button" className="text-button" disabled={busy} onClick={() => void loadPage(null, true, generation.current, filter)}>{en ? "Refresh feedback" : "刷新反馈记录"}</button>
    </>}
  </div>;
}
