import { useEffect, useRef, useState } from "react";
import { parseAdminEventPage } from "../domain/PlatformAdminEventDirectory";
import type { AdminEventCursor, AdminEventRow, AdminEventStatus } from "../domain/PlatformAdminEventDirectory";
import { supabase } from "../repositories/supabase";

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

/** Read-only triage. Every Edge request is JWT-authenticated and DB-reauthorized. */
export function PlatformAdminEventDirectory({ userId, en }: { userId: string; en: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<AdminEventRow[]>([]);
  const [cursor, setCursor] = useState<AdminEventCursor | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);

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
      setItems((previous) => reset ? page.items : [
        ...previous, ...page.items.filter((row) => !previous.some((old) => old.id === row.id)),
      ]);
      setCursor(page.nextCursor);
      setState("ready");
    } catch {
      if (generation.current !== epoch) return;
      // A failed page can mean permission revocation; never retain stale admin rows.
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
    void loadPage(null, true, epoch, filter);
    return () => { generation.current++; };
  }, [userId, filter]);

  return <div>
    <p className="muted small">{en ? "Read-only event directory. Each page is reauthorized by the server." : "只读赛事目录，每次查询均由服务端重新核验权限。"}</p>
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
        </li>)}
      </ol>
      {cursor && <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(cursor, false, generation.current, filter)}>{busy ? (en ? "Loading…" : "加载中…") : (en ? "Load more" : "加载更多")}</button>}
      <button type="button" className="text-button" disabled={busy} onClick={() => void loadPage(null, true, generation.current, filter)}>{en ? "Refresh events" : "刷新赛事"}</button>
    </>}
  </div>;
}
