import { useEffect, useRef, useState } from "react";
import { parseAdminReportPage } from "../domain/PlatformAdminReportDirectory";
import type { AdminReportCursor, AdminReportRow, AdminReportStatus } from "../domain/PlatformAdminReportDirectory";
import { supabase } from "../repositories/supabase";

type Filter = "all" | AdminReportStatus;
const filters: readonly Filter[] = ["all", "open", "in_review", "resolved", "dismissed"];
const labels: Record<Filter, [string, string]> = {
  all: ["全部状态", "All statuses"],
  open: ["待处理", "Open"],
  in_review: ["审核中", "In review"],
  resolved: ["已处理", "Resolved"],
  dismissed: ["已驳回", "Dismissed"],
};
const categoryLabels: Record<AdminReportRow["category"], [string, string]> = {
  safety: ["安全", "Safety"],
  conduct: ["行为", "Conduct"],
  spam: ["垃圾内容", "Spam"],
  privacy: ["隐私", "Privacy"],
  other: ["其他", "Other"],
};
const targetLabels: Record<AdminReportRow["target_kind"], [string, string]> = {
  user: ["用户", "User"],
  event: ["赛事", "Event"],
  match: ["比赛", "Match"],
  photo: ["照片", "Photo"],
};

/** Metadata-only triage; neither report narrative nor reporter identity is fetched. */
export function PlatformAdminReportDirectory({ userId, en }: { userId: string; en: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const scope = `${userId}:${filter}`;
  const [loadedScope, setLoadedScope] = useState("");
  const [items, setItems] = useState<AdminReportRow[]>([]);
  const [cursor, setCursor] = useState<AdminReportCursor | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);

  async function loadPage(before: AdminReportCursor | null, reset: boolean, epoch: number, selected: Filter) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (reset) {
      setItems([]);
      setCursor(null);
      setState("loading");
    }
    setBusy(true);
    try {
      if (!supabase) throw new Error("REPORT_DIRECTORY_UNAVAILABLE");
      const { data, error } = await supabase.functions.invoke("platform-admin-reports", {
        body: { page_size: 20, ...(selected === "all" ? {} : { status: selected }), ...(before ? { before } : {}) },
      });
      if (error) throw new Error("REPORT_DIRECTORY_UNAVAILABLE");
      const page = parseAdminReportPage(data, selected === "all" ? null : selected, 20);
      if (!page) throw new Error("INVALID_REPORT_DIRECTORY_RESPONSE");
      if (generation.current !== epoch) return;
      setItems((previous) => reset ? page.items : [
        ...previous, ...page.items.filter((row) => !previous.some((old) => old.id === row.id)),
      ]);
      setCursor(page.nextCursor);
      setState("ready");
    } catch {
      if (generation.current !== epoch) return;
      // Permission revocation or malformed data must not leave stale private records visible.
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

  if (loadedScope !== scope) return <p role="status">{en ? "Loading report records…" : "正在加载举报记录…"}</p>;
  return <div>
    <p className="muted small">{en
      ? "Read-only report metadata. Reporter identities and report descriptions are not displayed. Every request is reauthorized."
      : "仅查看举报元数据，不展示举报人身份或举报正文。每次查询均由服务端重新核验权限。"}</p>
    <label className="small" htmlFor="platform-admin-report-status">{en ? "Report status" : "举报状态"}</label>
    <select id="platform-admin-report-status" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
      {filters.map((value) => <option key={value} value={value}>{labels[value][en ? 1 : 0]}</option>)}
    </select>
    {state === "loading" && <p role="status">{en ? "Loading reports…" : "正在读取举报记录…"}</p>}
    {state === "failed" && <div role="alert">
      <p className="error">{en ? "Reports unavailable. Administrator access may have changed." : "暂时无法读取举报记录，管理员权限可能已变化。"}</p>
      <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(null, true, generation.current, filter)}>{en ? "Retry" : "重试"}</button>
    </div>}
    {state === "ready" && <>
      {items.length === 0 && <p className="muted small">{en ? "No matching reports." : "没有符合条件的举报记录。"}</p>}
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => <li key={item.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0", overflowWrap: "anywhere" }}>
          <strong>{targetLabels[item.target_kind][en ? 1 : 0]}</strong> <span className="badge">{labels[item.status][en ? 1 : 0]}</span>
          <p className="small">{categoryLabels[item.category][en ? 1 : 0]} · <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(en ? "en-US" : "zh-CN")}</time></p>
          <p className="small muted">{en ? "Report ID" : "举报 ID"}: {item.id}</p>
          <p className="small muted">{en ? "Target ID" : "对象 ID"}: {item.target_id} · {en ? "Version" : "版本"}: {item.version}</p>
        </li>)}
      </ol>
      {cursor && <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(cursor, false, generation.current, filter)}>{busy ? (en ? "Loading…" : "加载中…") : (en ? "Load more" : "加载更多")}</button>}
      <button type="button" className="text-button" disabled={busy} onClick={() => void loadPage(null, true, generation.current, filter)}>{en ? "Refresh reports" : "刷新举报记录"}</button>
    </>}
  </div>;
}
