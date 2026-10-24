import { useEffect, useRef, useState } from "react";
import { parseAdminPhotoPreview, validAdminPhotoId } from "../domain/PlatformAdminPhotoPreview";
import { supabase } from "../repositories/supabase";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://rtmjzmgrhifjzxaliltm.supabase.co";

type PreviewState = "idle" | "loading" | "ready" | "failed";

export function PlatformAdminPhotoPreview({ userId, eventId, photoId, en }: {
  userId: string; eventId: string; photoId: string; en: boolean;
}) {
  const scope = `${userId}:${eventId}:${photoId}`;
  const [loadedScope, setLoadedScope] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PreviewState>("idle");
  const generation = useRef(0);
  const inFlight = useRef(false);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearPreview() {
    generation.current++;
    inFlight.current = false;
    if (expiryTimer.current !== null) clearTimeout(expiryTimer.current);
    expiryTimer.current = null;
    setPreviewUrl(null);
    setStatus("idle");
  }

  useEffect(() => {
    clearPreview();
    setLoadedScope(scope);
    const hide = () => { if (document.visibilityState !== "visible") clearPreview(); };
    const focus = () => clearPreview();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("focus", focus);
    return () => {
      generation.current++;
      if (expiryTimer.current !== null) clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("focus", focus);
    };
  }, [userId, eventId, photoId]);

  async function requestPreview() {
    if (inFlight.current || !userId || !validAdminPhotoId(eventId) || !validAdminPhotoId(photoId)) return;
    const epoch = ++generation.current;
    inFlight.current = true;
    setPreviewUrl(null);
    setStatus("loading");
    if (expiryTimer.current !== null) clearTimeout(expiryTimer.current);
    expiryTimer.current = null;
    try {
      if (!supabase) throw new Error("PHOTO_PREVIEW_UNAVAILABLE");
      const { data, error } = await supabase.functions.invoke("platform-admin-photo-preview", {
        body: { event_id: eventId, photo_id: photoId },
      });
      if (error) throw new Error("PHOTO_PREVIEW_UNAVAILABLE");
      const result = parseAdminPhotoPreview(data, supabaseUrl);
      if (!result) throw new Error("INVALID_PHOTO_PREVIEW_RESPONSE");
      if (generation.current !== epoch) return;
      setPreviewUrl(result.url);
      setStatus("ready");
      expiryTimer.current = setTimeout(() => {
        if (generation.current === epoch) clearPreview();
      }, Math.max(0, (result.expiresIn - 5) * 1000));
    } catch {
      if (generation.current !== epoch) return;
      setPreviewUrl(null);
      setStatus("failed");
    } finally {
      if (generation.current === epoch) inFlight.current = false;
    }
  }

  if (loadedScope !== scope) return <p role="status">{en ? "Preparing photo review…" : "正在准备照片审核…"}</p>;
  return <div style={{ overflowWrap: "anywhere" }}>
    <button type="button" className="secondary" disabled={status === "loading" || !userId ||
      !validAdminPhotoId(eventId) || !validAdminPhotoId(photoId)}
      onClick={() => void requestPreview()}>
      {status === "loading" ? (en ? "Authorizing preview…" : "正在授权预览…") :
        (en ? "View watermarked preview" : "查看水印预览")}
    </button>
    {status === "failed" && <p role="alert" className="error">{en
      ? "Preview unavailable. Your access may have changed."
      : "暂时无法预览照片，或管理权限已变化。"}</p>}
    {status === "ready" && previewUrl && <div>
      <p className="small muted">{en ? "Temporary watermarked preview; no original image access." : "临时水印预览，不提供原图访问。"}</p>
      <img src={previewUrl} alt={en ? "Watermarked event photo for review" : "待审核赛事照片水印预览"}
        referrerPolicy="no-referrer" loading="lazy"
        onError={() => clearPreview()}
        style={{ display: "block", maxWidth: "100%", maxHeight: 320, objectFit: "contain" }} />
      <button type="button" className="text-button" onClick={() => clearPreview()}>
        {en ? "Close preview" : "关闭预览"}
      </button>
    </div>}
  </div>;
}
