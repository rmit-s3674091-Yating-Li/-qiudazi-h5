import { useEffect, useRef, useState } from "react";
import { parseAdminVenueCandidatePage } from "../domain/PlatformAdminVenueCandidates";
import type { AdminVenueCandidate, AdminVenueCandidateCursor } from "../domain/PlatformAdminVenueCandidates";
import { supabase } from "../repositories/supabase";

/** Event-supplied venue leads, not verified venues. Server reauthorizes every page. */
export function PlatformAdminVenueCandidateDirectory({ userId, en }: { userId: string; en: boolean }) {
  const [items, setItems] = useState<AdminVenueCandidate[]>([]);
  const [cursor, setCursor] = useState<AdminVenueCandidateCursor | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);

  async function loadPage(before: AdminVenueCandidateCursor | null, reset: boolean, epoch: number) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (reset) setState("loading");
    setBusy(true);
    try {
      if (!supabase) throw new Error("VENUE_CANDIDATE_DIRECTORY_UNAVAILABLE");
      const { data, error } = await supabase.functions.invoke("platform-admin-venue-candidates", {
        body: { page_size: 20, ...(before ? { before } : {}) },
      });
      if (error) throw new Error("VENUE_CANDIDATE_DIRECTORY_UNAVAILABLE");
      const page = parseAdminVenueCandidatePage(data);
      if (!page) throw new Error("INVALID_VENUE_CANDIDATE_RESPONSE");
      if (generation.current !== epoch) return;
      setItems((previous) => reset ? page.items : [
        ...previous, ...page.items.filter((row) => !previous.some((old) => old.event_id === row.event_id)),
      ]);
      setCursor(page.nextCursor);
      setState("ready");
    } catch {
      if (generation.current !== epoch) return;
      // An error may be revoked access: clear all previously displayed rows.
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
    void loadPage(null, true, epoch);
    return () => { generation.current++; };
  }, [userId]);

  return <div>
    <p className="muted small">{en
      ? "Event organizers supplied these venue names. They have not been verified or approved as venue listings."
      : "以下场馆名称由赛事创建者填写，未经平台核验，也不代表已收录为正式场馆。"}</p>
    {state === "loading" && <p role="status">{en ? "Loading venue candidates…" : "正在读取场馆候选…"}</p>}
    {state === "failed" && <div role="alert">
      <p className="error">{en ? "Venue candidates are unavailable. Administrator access may have changed." : "暂时无法读取场馆候选，管理员权限可能已变化。"}</p>
      <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(null, true, generation.current)}>{en ? "Retry" : "重试"}</button>
    </div>}
    {state === "ready" && <>
      {items.length === 0 && <p className="muted small">{en ? "No venue candidates found." : "暂无场馆候选。"}</p>}
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => <li key={item.event_id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0", overflowWrap: "anywhere" }}>
          <strong>{item.venue_name}</strong> <span className="badge">{en ? "Not verified" : "未核验"}</span>
          <p className="small muted">{item.city || (en ? "City not provided" : "未填写城市")}</p>
          <p className="small muted">{en ? "Source event" : "来源赛事"}: {item.event_id} · {en ? "Event version" : "赛事版本"}: {item.event_version}</p>
        </li>)}
      </ol>
      {cursor && <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(cursor, false, generation.current)}>{busy ? (en ? "Loading…" : "加载中…") : (en ? "Load more" : "加载更多")}</button>}
      <button type="button" className="text-button" disabled={busy} onClick={() => void loadPage(null, true, generation.current)}>{en ? "Refresh candidates" : "刷新候选"}</button>
    </>}
  </div>;
}
