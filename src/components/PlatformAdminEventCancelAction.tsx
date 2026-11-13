import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { adminCancelFailure, parseAdminCancelResponse, prepareAdminCancelRequest } from "../domain/PlatformAdminEventCancel";
import type { AdminCancelRequest, CancelableAdminEvent } from "../domain/PlatformAdminEventCancel";
import { supabase } from "../repositories/supabase";

type Props = {
  event: CancelableAdminEvent;
  role: string | null;
  userId: string;
  en: boolean;
  onCancelled: () => void;
};

/** Standalone high-risk action. Mount only after the trusted Edge + SQL migration are verified. */
export function PlatformAdminEventCancelAction({ event, role, userId, en, onCancelled }: Props) {
  const [reason, setReason] = useState("");
  const [typedName, setTypedName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const attempt = useRef<AdminCancelRequest | null>(null);
  const inFlight = useRef(false);
  const epoch = useRef(0);

  useEffect(() => {
    epoch.current++;
    attempt.current = null;
    inFlight.current = false;
    setReason(""); setTypedName(""); setAcknowledged(false);
    setBusy(false); setError(""); setRetryable(false); setSucceeded(false);
    return () => { epoch.current++; };
  }, [userId, event.id, event.version, role]);

  if (role !== "super_admin" || (event.status !== "signup" && event.status !== "locked")) return null;

  async function submit(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    if (inFlight.current || succeeded || (attempt.current && !retryable)) return;
    let command = attempt.current;
    if (!command) {
      const prepared = prepareAdminCancelRequest({
        role, event, reason, typedName, acknowledged, requestId: crypto.randomUUID(),
      });
      if (!prepared.ok) {
        setError(en ? "Enter a reason (10–1000 characters), type the exact event name and confirm." :
          "请填写10至1000字原因、准确输入赛事名称并勾选确认。");
        return;
      }
      command = prepared.command;
      attempt.current = command;
    }
    const generation = epoch.current;
    inFlight.current = true;
    setBusy(true); setError(""); setRetryable(false);
    try {
      if (!supabase) throw new Error("UNAVAILABLE");
      const { data, error: invokeError } = await supabase.functions.invoke("platform-admin-event-cancel", { body: command });
      if (invokeError) {
        const response = (invokeError as { context?: Response }).context;
        let code: string | null = null;
        try { const payload: unknown = await response?.clone().json();
          if (payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string") code = payload.code;
        } catch { }
        if (epoch.current !== generation) return;
        const retry = adminCancelFailure(response?.status ?? null, code) === "retry_same_request";
        setRetryable(retry);
        setError(retry ? (en ? "Status unknown. Retry this same request; no new cancellation will be created." :
          "操作结果暂不确定，可使用原请求重试，不会生成新的取消操作。") :
          (en ? "Cancellation was rejected or the event changed. Refresh the event before trying again." :
            "取消请求被拒绝或赛事已变化，请刷新赛事后再操作。"));
        return;
      }
      if (!parseAdminCancelResponse(data, command)) throw new Error("INVALID_RESPONSE");
      if (epoch.current !== generation) return;
      attempt.current = null;
      setSucceeded(true);
      try { onCancelled(); } catch { }
    } catch {
      if (epoch.current !== generation) return;
      setRetryable(true);
      setError(en ? "Could not confirm the result. Retry the same request or refresh the event." :
        "暂时无法确认操作结果，请使用原请求重试或刷新赛事。");
    } finally {
      if (epoch.current === generation) { inFlight.current = false; setBusy(false); }
    }
  }

  return <form onSubmit={(e) => void submit(e)} aria-label={en ? "Cancel event" : "取消赛事"}>
    <p className="small muted">{en ? "High-risk action: only an active super administrator may cancel an unstarted event. The server records an audit reason." :
      "高风险操作：仅有效超级管理员可取消尚未开始的赛事，服务端将记录审计原因。"}</p>
    <label htmlFor={`cancel-reason-${event.id}`}>{en ? "Cancellation reason" : "取消原因"}</label>
    <textarea id={`cancel-reason-${event.id}`} value={reason} onChange={(e) => setReason(e.target.value)}
      disabled={busy || !!attempt.current || succeeded} maxLength={1000} required rows={3} />
    <label htmlFor={`cancel-name-${event.id}`}>{en ? `Type “${event.name}” to confirm` : `请输入“${event.name}”以确认`}</label>
    <input id={`cancel-name-${event.id}`} value={typedName} onChange={(e) => setTypedName(e.target.value)}
      disabled={busy || !!attempt.current || succeeded} autoComplete="off" required />
    <label><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)}
      disabled={busy || !!attempt.current || succeeded} />{en ? "I understand this cancellation is audited and cannot be undone here." :
        "我理解此操作会被审计，且无法在此撤销。"}</label>
    {error && <p role="alert" className="error">{error}</p>}
    {succeeded && <p role="status">{en ? "Cancellation confirmed." : "赛事取消已确认。"}</p>}
    <button type="submit" disabled={busy || succeeded || (!!attempt.current && !retryable)}>
      {busy ? (en ? "Submitting…" : "提交中…") : retryable ? (en ? "Retry same request" : "使用原请求重试") :
        (en ? "Confirm event cancellation" : "确认取消赛事")}
    </button>
  </form>;
}
