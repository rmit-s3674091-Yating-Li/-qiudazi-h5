import { useEffect, useRef, useState } from "react";
import { parsePhotoRemovalResult, photoRemovalOperation, validPhotoRemovalReason } from "../domain/PlatformAdminPhotoRemoval";
import { supabase } from "../repositories/supabase";

/** High-risk operation: UI is only a guardrail; Edge and SQL reauthorize every request. */
export function PlatformAdminPhotoRemovalAction({ userId, eventId, photoId, version, en, onRemoved }: {
  userId: string; eventId: string; photoId: string; version: number; en: boolean; onRemoved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const inFlight = useRef(false);
  const operation = useRef<{ payloadKey: string; id: string } | null>(null);

  useEffect(() => {
    generation.current++;
    operation.current = null;
    inFlight.current = false;
    setReason("");
    setConfirmed(false);
    setBusy(false);
    setError("");
    const invalidate = () => { generation.current++; setConfirmed(false); };
    const onVisibility = () => { if (document.visibilityState !== "visible") invalidate(); };
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      generation.current++;
      window.removeEventListener("focus", invalidate);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId, eventId, photoId, version]);

  async function remove() {
    if (inFlight.current || !confirmed || !validPhotoRemovalReason(reason) || !Number.isSafeInteger(version) || version < 1) return;
    const trimmed = reason.replace(/^ +| +$/g, "");
    const payloadKey = `${userId}:${eventId}:${photoId}:${version}:${trimmed}`;
    operation.current = photoRemovalOperation(operation.current, payloadKey, () => crypto.randomUUID());
    const requestId = operation.current.id;
    const epoch = ++generation.current;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!supabase) throw new Error("PHOTO_REMOVAL_UNAVAILABLE");
      const { data, error: invokeError } = await supabase.functions.invoke("platform-admin-photo-remove", {
        body: {
          event_id: eventId, photo_id: photoId, expected_version: version,
          request_id: requestId, reason: trimmed, confirmed: true,
        },
      });
      if (invokeError) throw new Error("PHOTO_REMOVAL_UNCONFIRMED");
      const result = parsePhotoRemovalResult(data, eventId, photoId);
      if (!result) throw new Error("INVALID_PHOTO_REMOVAL_RESPONSE");
      if (generation.current !== epoch) return;
      operation.current = null;
      onRemoved();
    } catch {
      if (generation.current !== epoch) return;
      // The server may have committed before a network failure. Keep the same
      // request_id for a retry; never manufacture a second removal operation.
      setError(en
        ? "The outcome could not be confirmed. Retry the same request or refresh the photo list."
        : "暂时无法确认处理结果。可使用原操作编号安全重试，或刷新照片列表。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <section aria-label={en ? "Remove event photo" : "移除赛事照片"}>
    <p className="muted small">{en
      ? "Super administrator only. Removes the event photo record and queues Storage cleanup; previously issued links may remain valid until expiry. Personal album copies are not removed."
      : "仅超级管理员可操作。移除赛事照片记录并登记存储清理任务；已签发链接可能在过期前继续有效，个人相册副本不受影响。"}</p>
    <label htmlFor={`photo-remove-reason-${photoId}`}>{en ? "Reason (10–1000 characters)" : "移除原因（10–1000 字）"}</label>
    <textarea id={`photo-remove-reason-${photoId}`} value={reason} maxLength={1000} disabled={busy}
      onChange={(event) => { setReason(event.target.value); setError(""); operation.current = null; }} />
    <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
      {en ? "I reviewed the evidence and confirm removal." : "我已核实证据，并确认移除该照片。"}
    </label>
    <button type="button" className="secondary" disabled={busy || !confirmed || !validPhotoRemovalReason(reason)}
      onClick={() => void remove()}>{busy ? (en ? "Removing…" : "处理中…") : (en ? "Remove event photo" : "移除赛事照片")}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
