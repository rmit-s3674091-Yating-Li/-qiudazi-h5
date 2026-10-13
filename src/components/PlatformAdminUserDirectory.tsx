import { useEffect, useRef, useState } from "react";
import { parseAdminUserPage } from "../domain/PlatformAdminUserDirectory";
import type { AdminUserCursor, AdminUserRow } from "../domain/PlatformAdminUserDirectory";
import { supabase } from "../repositories/supabase";

/** Read-only user directory; server reauthorizes super_admin for every page. */
export function PlatformAdminUserDirectory({ userId, en }: { userId: string; en: boolean }) {
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [cursor, setCursor] = useState<AdminUserCursor | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);

  async function loadPage(before: AdminUserCursor | null, reset: boolean, epoch: number) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (reset) {
      setItems([]);
      setCursor(null);
      setState("loading");
    }
    setBusy(true);
    try {
      if (!supabase) throw new Error("USER_DIRECTORY_UNAVAILABLE");
      const { data, error } = await supabase.functions.invoke("platform-admin-users", {
        body: { page_size: 20, ...(before ? { before } : {}) },
      });
      if (error) throw new Error("USER_DIRECTORY_UNAVAILABLE");
      const page = parseAdminUserPage(data);
      if (!page) throw new Error("INVALID_USER_DIRECTORY_RESPONSE");
      if (generation.current !== epoch) return;
      setItems((previous) => reset ? page.items : [
        ...previous, ...page.items.filter((row) => !previous.some((old) => old.id === row.id)),
      ]);
      setCursor(page.nextCursor);
      setState("ready");
    } catch {
      if (generation.current !== epoch) return;
      // A failed request can indicate revoked permissions: discard cached rows.
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
    <p className="muted small">{en ? "Read-only user directory. Each request checks administrator access again." : "只读用户目录，每次请求均重新核验管理员权限。"}</p>
    {state === "loading" && <p role="status">{en ? "Loading users…" : "正在加载用户…"}</p>}
    {state === "failed" && <div role="alert">
      <p className="error">{en ? "User directory unavailable or access revoked." : "用户目录暂不可用，或当前权限已被撤销。"}</p>
      <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(null, true, generation.current)}>{en ? "Retry" : "重试"}</button>
    </div>}
    {state === "ready" && <>
      {items.length === 0 && <p className="muted small">{en ? "No users found." : "暂无用户记录。"}</p>}
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => <li key={item.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0", overflowWrap: "anywhere" }}>
          <strong>{item.nickname || (en ? "Unnamed profile" : "未设置昵称")}</strong>
          <p className="small">{en ? "Profile status" : "资料状态"}: {item.profile_status}</p>
          <p className="small muted">{en ? "Profile ID" : "用户资料 ID"}: {item.id}</p>
          <p className="small muted"><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(en ? "en-US" : "zh-CN")}</time></p>
        </li>)}
      </ol>
      {cursor && <button type="button" className="secondary" disabled={busy} onClick={() => void loadPage(cursor, false, generation.current)}>
        {busy ? (en ? "Loading…" : "加载中…") : (en ? "Load more" : "加载更多")}
      </button>}
      {!cursor && items.length > 0 && <p className="muted small">{en ? "End of user directory." : "已显示全部用户。"}</p>}
      <button type="button" className="text-button" disabled={busy} onClick={() => void loadPage(null, true, generation.current)}>{en ? "Refresh users" : "刷新用户"}</button>
    </>}
  </div>;
}
