import { useEffect, useRef, useState } from "react";
import {
  makeFeedbackResolutionAttempt, submitFeedbackResolution,
} from "../domain/PlatformAdminFeedbackResolution";
import type { FeedbackResolutionAttempt, FeedbackResolutionDecision } from "../domain/PlatformAdminFeedbackResolution";
import { supabase } from "../repositories/supabase";

type Props = {
  userId: string;
  feedbackId: string;
  version: number;
  status: "open" | "in_review" | "resolved" | "dismissed";
  role: "reviewer" | "operator" | "super_admin";
  en: boolean;
  onRefresh: () => void;
};
type Result = "idle" | "sending" | "committed" | "conflict" | "forbidden" | "not_found" | "invalid" | "uncertain";

/** Unmounted action module: integrate only after feedback directory and audited Edge/RPC are verified. */
export function PlatformAdminFeedbackResolutionAction({ userId, feedbackId, version, status, role, en, onRefresh }: Props) {
  const scope = `${userId}:${feedbackId}:${version}:${status}`;
  const [loadedScope, setLoadedScope] = useState("");
  const [decision, setDecision] = useState<FeedbackResolutionDecision>("resolved");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState<FeedbackResolutionAttempt | null>(null);
  const [result, setResult] = useState<Result>("idle");
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    setLoadedScope(scope);
    setDecision("resolved");
    setReason("");
    setConfirmed(false);
    setAttempt(null);
    setResult("idle");
    return () => { generation.current++; inFlight.current = false; };
  }, [scope]);

  const eligible = role === "operator" || role === "super_admin";
  const actionable = status === "open" || status === "in_review";
  if (loadedScope !== scope || !eligible || !actionable) return null;
  const locked = !!attempt || result !== "idle";
  const reasonLength = Array.from(reason.replace(/^ +| +$/g, "")).length;
  const canSubmit = !locked && confirmed && reasonLength >= 10 && reasonLength <= 1000 &&
    Number.isSafeInteger(version) && version > 0 && version < 2147483647;

  async function send(existing: FeedbackResolutionAttempt | null) {
    if (inFlight.current || !eligible || !actionable) return;
    const operation = existing ?? makeFeedbackResolutionAttempt({
      feedbackId, version, decision, reason, requestId: crypto.randomUUID(),
    });
    if (!operation || (!existing && !canSubmit)) return;
    // Preserve operation UUID and immutable payload before the first network call.
    inFlight.current = true;
    const epoch = generation.current;
    setAttempt(operation);
    setResult("sending");
    const outcome = supabase
      ? await submitFeedbackResolution((name, options) => supabase.functions.invoke(name, options), operation)
      : { kind: "uncertain" as const };
    if (epoch !== generation.current) return;
    inFlight.current = false;
    if (outcome.kind === "committed") {
      setResult("committed");
      setAttempt(null);
      onRefresh();
    } else if (outcome.kind === "uncertain") {
      // May have committed despite a lost response; never mint another request_id for retry.
      setResult("uncertain");
    } else {
      setResult(outcome.kind);
      setAttempt(null);
      if (outcome.kind === "conflict") onRefresh();
    }
  }

  const feedback: Record<Exclude<Result, "idle" | "sending">, [string, string]> = {
    committed: ["处理已提交，正在刷新记录。", "Action saved. Refreshing the record."],
    conflict: ["反馈记录已变化，需重新读取后再处理。", "The feedback changed. Reload it before taking action."],
    forbidden: ["当前账号无权处理此反馈，请重新核验管理员权限。", "Access denied. Recheck administrator permissions."],
    not_found: ["该反馈记录已不存在，请刷新。", "Feedback not found. Refresh the list."],
    invalid: ["提交内容不符合要求，请刷新记录后重试。", "Invalid action. Reload the record before retrying."],
    uncertain: ["结果暂未确认。可使用同一操作编号安全重试，或先刷新记录。", "Result unknown. Retry the same operation safely, or refresh first."],
  };

  return <div className="card" style={{ overflowWrap: "anywhere" }}>
    <p className="small muted">{en ? "Audited feedback resolution · the server checks permission and version again." : "反馈处理将记录审计，服务端会再次核验权限和版本。"}</p>
    <label className="small" htmlFor={`feedback-decision-${feedbackId}`}>{en ? "Decision" : "处理决定"}</label>
    <select id={`feedback-decision-${feedbackId}`} value={decision} disabled={locked} onChange={(event) => setDecision(event.target.value as FeedbackResolutionDecision)}>
      <option value="resolved">{en ? "Resolve" : "标记已处理"}</option>
      <option value="dismissed">{en ? "Dismiss" : "驳回"}</option>
    </select>
    <label className="small" htmlFor={`feedback-reason-${feedbackId}`}>{en ? "Reason (10–1000 characters)" : "处理原因（10–1000 字）"}</label>
    <textarea id={`feedback-reason-${feedbackId}`} value={reason} disabled={locked} maxLength={1000}
      onChange={(event) => setReason(event.target.value)} rows={3} />
    <label className="small" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <input type="checkbox" checked={confirmed} disabled={locked} onChange={(event) => setConfirmed(event.target.checked)} />
      {en ? "I confirm this decision and understand it will be audited." : "我确认本次处理决定，并知悉操作将被审计。"}
    </label>
    {result === "idle" && <button type="button" disabled={!canSubmit} onClick={() => void send(null)}>
      {en ? "Submit decision" : "确认提交处理"}
    </button>}
    {result === "sending" && <p role="status">{en ? "Submitting…" : "正在提交…"}</p>}
    {result !== "idle" && result !== "sending" && <p role="alert">{feedback[result][en ? 1 : 0]}</p>}
    {result === "uncertain" && <button type="button" className="secondary" onClick={() => void send(attempt)} disabled={!attempt || inFlight.current}>
      {en ? "Retry same operation" : "使用同一操作编号重试"}
    </button>}
    {result !== "idle" && result !== "sending" && <button type="button" className="text-button" onClick={onRefresh}>
      {en ? "Refresh record" : "刷新反馈记录"}
    </button>}
  </div>;
}
