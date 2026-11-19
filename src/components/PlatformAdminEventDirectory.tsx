import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PlatformAdminEventCancelAction } from "./PlatformAdminEventCancelAction";
import { parseAdminEventPage, validAdminEventPageBoundary } from "../domain/PlatformAdminEventDirectory";
import type { AdminEventCursor, AdminEventRow, AdminEventStatus } from "../domain/PlatformAdminEventDirectory";
import { rpc, supabase } from "../repositories/supabase";

type Filter = "all" | AdminEventStatus;
const statusOptions: readonly Filter[] = ["all", "signup", "locked", "ongoing", "finished", "cancelled"];
const statusText: Record<Filter, [string, string]> = {
  all: ["全部状态", "All statuses"],
  signup: ["报名中", "Registration"],
  locked: ["报名结束", "Registration closed"],
  ongoing: ["进行中", "Ongoing"],
  finished: ["已结束", "Finished"],
  cancelled: ["已取消", "Cancelled"],
};

/** Audited cancellation is available only to a freshly checked super administrator. */
export function PlatformAdminEventDirectory({ userId, en }: { userId: string; en: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const scope = `${userId}:${filter}`;
  const [loadedScope, setLoadedScope] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roleAccess, setRoleAccess] = useState<{ userId: string; role: string | null }>({ userId: "", role: null });
  const roleEpoch = useRef(0);
  const [items, setItems] = useState<AdminEventRow[]>([]);
  const [cursor, setCursor] = useState<AdminEventCursor | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const recheckRole = () => {
      const epoch = ++roleEpoch.current;
      setRoleAccess({ userId, role: null });
      setSelectedId(null);
      void rpc<string | null>("platform_admin_my_role")
        .then((role) => {
          if (cancelled || roleEpoch.current !== epoch) return;
          setRoleAccess({ userId, role: role === "super_admin" ? role : null });
        })
        .catch(() => {
          if (!cancelled && roleEpoch.current === epoch) setRoleAccess({ userId, role: null });
        });
    };
    const onFocus = () => { if (document.visibilityState === "visible") recheckRole(); };
    recheckRole();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      roleEpoch.current++;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [userId]);

  const canCancel = roleAccess.userId === userId && roleAccess.role === "super_admin";

  function refreshAfterCancel() {
    const epoch = ++generation.current;
    inFlight.current = false;
    setSelectedId(null);
    setItems([]);
    setCursor(null);
    setState("loading");
    void loadPage(null, true, epoch, filter);
  }

  async function loadPage(before: AdminEventCursor | null, reset: boolean, epoch: number, selected: Filter) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (reset) setState("loading");
    setBusy(true);
    try {
      if (!supabase) throw new Error("EVENT_DIRECTORY_UNAVAILABLE");
      const { data, error } = await supabase.functions.invoke("platform-admin-events", {
        body: { page_size: 20, ...(selected === "all" ? {} : { status: selected }), ...(before ? { before } : {}) },
      });
      if (error) throw new Error("EVENT_DIRECTORY_UNAVAILABLE");
      const page = parseAdminEventPage(data);
      if (!page) throw new Error("INVALID_EVENT_DIRECTORY_RESPONSE");
      if (generation.current !== epoch) return;
      const previous = reset ? [] : items;
      if (!validAdminEventPageBoundary(page, before, previous)) {
        throw new Error("INVALID_EVENT_DIRECTORY_PAGE_BOUNDARY");
      }
      setItems([...previous, ...page.items]);
      setCursor(page.nextCursor);
      setState("ready");
    } catch {
      if (generation.current !== epoch) return;
      setItems([]);
      setCursor(null);
      setSelectedId(null);
      setRoleAccess({ userId, role: null });
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
    setSelectedId(null);
    setLoadedScope(scope);
    void loadPage(null, true, epoch, filter);
    return () => { generation.current++; };
  }, [userId, filter]);

  if (loadedScope !== scope) return <p role="status">{en ? "Loading event records…" : "正在加载赛事记录…"}</p>;
  return <div>
    <p className="muted small">{en
      ? "Event directory. Only a verified super administrator may cancel an unstarted event with an audited reason. Each request is reauthorized by the server."
      : "赛事目录。仅经重新核验的超级管理员可填写审计原因取消未开始的赛事，每次请求均由服务端重新授权。"}</p>
    <label className="small" htmlFor="platform-admin-event-status">{en ? "Event status" : "赛事状态"}</label>
    <select id="platform-admin-event-status" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
      {statusOptions.map((value) => <option key={value} value={value}>{statusText[value][en ? 1 : 0]}</option>)}
    </select>
    {state === "loading" && <p role="status">{en ? "Loading events…" : "正在读取赛事…"}</p>}
    {state === "failed" && <div role="alert">
      <p className="error">{en ? "Event directory unavailable. Access may have changed." : "暂时无法读取赛事目录，管理权限可能已变化。"}</p>
      <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(null, true, generation.current, filter)}>{en ? "Retry" : "重试"}</button>
    </div>}
    {state === "ready" && <>
      {items.length === 0 && <p className="muted small">{en ? "No matching events." : "没有符合条件的赛事。"}</p>}
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => <li key={item.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0", overflowWrap: "anywhere" }}>
          <strong>{item.name}</strong> <span className="badge">{statusText[item.status][en ? 1 : 0]}</span>
          <p className="small">{item.event_date ?? (en ? "Date not set" : "未设置日期")} · {item.city || (en ? "City not set" : "未设置城市")}</p>
          <p className="small muted">{item.event_mode === "quick" ? (en ? "Quick" : "快速开赛") : (en ? "Standard" : "常规赛事")} · {item.format} · {item.match_type}</p>
          <p className="small muted">{en ? "Event ID" : "赛事 ID"}: {item.id} · {en ? "Version" : "版本"}: {item.version}</p>
          <p className="small muted">{en ? "Organizer ID" : "创建者 ID"}: {item.owner_user_id}</p>
          <Link className="text-button" to={`/platform-admin?score_event=${encodeURIComponent(item.id)}#platform-admin-score-exceptions`}>{en ? "Inspect score exceptions" : "查看比分异常"}</Link>
          {canCancel && (item.status === "signup" || item.status === "locked") && <>
            <button type="button" className="secondary" aria-expanded={selectedId === item.id}
              aria-controls={`platform-admin-event-cancel-${item.id}`}
              onClick={() => setSelectedId((previous) => previous === item.id ? null : item.id)}>
              {selectedId === item.id ? (en ? "Close cancellation" : "收起取消操作") : (en ? "Review cancellation" : "审核取消赛事")}
            </button>
            {selectedId === item.id && <div id={`platform-admin-event-cancel-${item.id}`}>
              <PlatformAdminEventCancelAction key={`${userId}:${item.id}:${item.version}`}
                userId={userId} event={item} role={roleAccess.role} en={en} onCancelled={refreshAfterCancel} />
            </div>}
          </>}
        </li>)}
      </ol>
      {cursor && <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(cursor, false, generation.current, filter)}>{busy ? (en ? "Loading…" : "加载中…") : (en ? "Load more" : "加载更多")}</button>}
      <button type="button" className="text-button" disabled={busy} onClick={() => void loadPage(null, true, generation.current, filter)}>{en ? "Refresh events" : "刷新赛事"}</button>
    </>}
  </div>;
}
