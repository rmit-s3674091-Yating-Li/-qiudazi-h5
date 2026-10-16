import { useEffect, useRef, useState } from "react";
import { parseAdminPhotoPage } from "../domain/PlatformAdminPhotoDirectory";
import { PlatformAdminPhotoPreview } from "./PlatformAdminPhotoPreview";
import { PlatformAdminPhotoRemovalAction } from "./PlatformAdminPhotoRemovalAction";
import type { AdminPhotoCursor, AdminPhotoRow } from "../domain/PlatformAdminPhotoDirectory";
import { rpc, supabase } from "../repositories/supabase";

/** Event-photo triage; destructive actions are independently reauthorized by Edge. */
export function PlatformAdminPhotoDirectory({ userId, eventId, en }: {
  userId: string; eventId: string; en: boolean;
}) {
  const scope = `${userId}:${eventId}`;
  const [loadedScope, setLoadedScope] = useState("");
  const [items, setItems] = useState<AdminPhotoRow[]>([]);
  const [cursor, setCursor] = useState<AdminPhotoCursor | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const [superAdmin, setSuperAdmin] = useState(false);
  const roleGeneration = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const verify = () => {
      const epoch = ++roleGeneration.current;
      setSuperAdmin(false);
      setSelectedPhotoId(null);
      void rpc<string | null>("platform_admin_my_role").then((role) => {
        if (!cancelled && roleGeneration.current === epoch) setSuperAdmin(role === "super_admin");
      }).catch(() => {
        if (!cancelled && roleGeneration.current === epoch) setSuperAdmin(false);
      });
    };
    const onFocus = () => { if (document.visibilityState === "visible") verify(); };
    verify();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      roleGeneration.current++;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [userId, eventId]);

  async function loadPage(before: AdminPhotoCursor | null, reset: boolean, epoch: number) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (reset) {
      setSelectedPhotoId(null);
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
      setSelectedPhotoId(null);
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
    setSelectedPhotoId(null);
    setState("loading");
    setLoadedScope(scope);
    void loadPage(null, true, epoch);
    return () => { generation.current++; };
  }, [userId, eventId]);

  if (loadedScope !== scope) return <p role="status">{en ? "Loading photo records…" : "正在加载照片记录…"}</p>;
  return <div>
    <p className="muted small">{en
      ? "Photo review uses short-lived watermarked previews. Only verified super administrators may remove an event photo; the server independently checks every action."
      : "照片审核使用短时水印预览。仅经核验的超级管理员可移除赛事照片；服务端独立核验每次操作。"}</p>
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
          <button type="button" className="secondary"
            aria-expanded={selectedPhotoId === item.id}
            aria-controls={`platform-admin-photo-preview-${item.id}`}
            onClick={() => setSelectedPhotoId((current) => current === item.id ? null : item.id)}>
            {selectedPhotoId === item.id ? (en ? "Hide preview" : "收起预览") : (en ? "Review photo" : "审核预览")}
          </button>
          {selectedPhotoId === item.id && <div id={`platform-admin-photo-preview-${item.id}`}>
            <PlatformAdminPhotoPreview key={item.id} userId={userId} eventId={eventId} photoId={item.id} en={en} />
            {superAdmin && <PlatformAdminPhotoRemovalAction
              key={`${userId}:${eventId}:${item.id}:${item.version}`} userId={userId}
              eventId={eventId} photoId={item.id} version={item.version} en={en}
              onRemoved={() => void loadPage(null, true, ++generation.current)} />}
          </div>}
        </li>)}
      </ol>
      {cursor && <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(cursor, false, generation.current)}>{busy ? (en ? "Loading…" : "加载中…") : (en ? "Load more" : "加载更多")}</button>}
      {!cursor && items.length > 0 && <p className="muted small">{en ? "End of photo records." : "已显示全部照片记录。"}</p>}
      <button type="button" className="text-button" disabled={busy} onClick={() => void loadPage(null, true, generation.current)}>{en ? "Refresh records" : "刷新记录"}</button>
    </>}
  </div>;
}
