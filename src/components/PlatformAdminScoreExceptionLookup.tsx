import { useState } from "react";
import { normalizeScoreExceptionEventId } from "../domain/PlatformAdminScoreExceptionLookup";
import { PlatformAdminScoreExceptions } from "./PlatformAdminScoreExceptions";

/** Read-only event-scoped anomaly lookup; authorization remains entirely server-side. */
export function PlatformAdminScoreExceptionLookup({ userId, en }: { userId: string; en: boolean }) {
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const validId = normalizeScoreExceptionEventId(input);

  return <div>
    <p className="muted small">{en
      ? "Copy an event ID from Events to review structural score anomalies. Results are read-only; an anomaly does not authorize score changes."
      : "从赛事管理复制赛事 ID，可查看该赛事的结构性比分异常。查询仅供核查，不授权修改比分。"}</p>
    <form onSubmit={(event) => {
      event.preventDefault();
      setAttempted(true);
      setSelected(validId);
    }}>
      <label htmlFor="admin-score-exception-event-id">{en ? "Event ID" : "赛事 ID"}</label>
      <input
        id="admin-score-exception-event-id"
        type="text"
        value={input}
        maxLength={64}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={attempted && !validId}
        onChange={(event) => {
          setInput(event.target.value);
          setSelected(null);
          setAttempted(false);
        }}
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      />
      <button type="submit" className="secondary">{en ? "Check exceptions" : "查询异常"}</button>
    </form>
    {attempted && !validId && <p role="alert" className="error-text">{en
      ? "Enter a valid event ID from the event directory."
      : "请输入赛事管理中显示的有效赛事 ID。"}</p>}
    {selected && <PlatformAdminScoreExceptions
      key={`${userId}:${selected}`}
      userId={userId}
      eventId={selected}
      en={en}
    />}
  </div>;
}
