import { useEffect, useRef, useState } from "react";
import { parseAdminPhotoPage } from "../domain/PlatformAdminPhotoDirectory";
import type { AdminPhotoCursor, AdminPhotoRow } from "../domain/PlatformAdminPhotoDirectory";
import { supabase } from "../repositories/supabase";

/** Read-only event-photo metadata triage. No image preview or moderation mutation. */
export function PlatformAdminPhotoDirectory({ userId, eventId, en }: {
  userId: string; eventId: string; en: boolean;
}) {
  const scope = `${userId}:${eventId}`;
  const [loadedScope, setLoadedScope] = useState("");
  const [items, setItems] = useState<AdminPhotoRow[]>([]);
  const [cursor, setCursor] = useState<AdminPhotoCursor | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);

  async function loadPage(before: AdminPhotoCursor | null, reset: boolean, epoch: number) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (reset) {
      setItems([]);
      setCursor(null);
      setState("loading");
    }
    setBusy(true);
    try {
      if (!supabase) throw new Error("PHOTO_DIRECTORY_UNAVAILABLE");
      const { data, error } = await supabase.functions.invoke("platform-admin-photos", {
        body: { event_id: eventId, page_size: 20, ...(before ? { before } : {}) },
      });
      if (error) throw new Error("PHOTO_DIRECTORY_UNAVAILABLE");
      const page = parseAdminPhotoPage(data, eventId, 20);
      if (!page) throw new Error("INVALID_PHOTO_DIRECTORY_RESPONSE");
      if (generation.current !== epoch) return;
      setItems((previous) => reset ? page.items : [
        ...previous, ...page.items.filter((row) => !previous.some((old) => old.id === row.id)),
      ]);
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
    void loadPage(null, true, epoch);
    return () => { generation.current++; };
  }, [userId, eventId]);

  if (loadedScope !== scope) return <p role="status">{en ? "Loading photo records…" : "正在加载照片记录…"}</p>;
  return <div>
    <p className="muted small">{en
      ? "Event photo metadata only. No image preview or moderation action is available. Each request is reauthorized."
      : "仅显示赛事照片元数据，不提供照片预览或治理操作。每次查询均由服务端重新核验权限。"}</p>
    <p className="small muted" style={{ overflowWrap: "anywhere" }}>{en ? "Event ID" : "赛事 ID"}: {eventId}</p>
    {state === "loading" && <p role="status">{en ? "Loading photo records…" : "正在加载照片记录…"}</p>}
    {state === "failed" && <div role="alert">
      <p className="error">{en ? "Photo records unavailable or administrator access changed." : "暂时无法读取照片记录，或管理员权限已变化。"}</p>
      <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(null, true, generation.current)}>{en ? "Retry" : "重试"}</button>
    </div>}
    {state === "ready" && <>
      {items.length === 0 && <p className="muted small">{en ? "No event photos found." : "该赛事暂无照片记录。"}</p>}
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => <li key={item.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0", overflowWrap: "anywhere" }}>
          <p className="small">{en ? "Photo ID" : "照片 ID"}: {item.id}</p>
          <p className="small muted">{en ? "Version" : "版本"}: {item.version}</p>
          <p className="small muted">{en ? "Uploaded" : "上传时间"}: <time dateTime={item.uploaded_at}>{new Date(item.uploaded_at).toLocaleString(en ? "en-US" : "zh-CN")}</time></p>
        </li>)}
      </ol>
      {cursor && <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(cursor, false, generation.current)}>{busy ? (en ? "Loading…" : "加载中…") : (en ? "Load more" : "加载更多")}</button>}
      {!cursor && items.length > 0 && <p className="muted small">{en ? "End of photo records." : "已显示全部照片记录。"}</p>}
      <button type="button" className="text-button" disabled={busy} onClick={() => void loadPage(null, true, generation.current)}>{en ? "Refresh records" : "刷新记录"}</button>
    </>}
  </div>;
}
