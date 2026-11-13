import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { normalizeScoreExceptionEventId, scoreExceptionEventFromSearch } from "../domain/PlatformAdminScoreExceptionLookup";
import { PlatformAdminScoreExceptions } from "./PlatformAdminScoreExceptions";

/** Read-only event-scoped anomaly lookup; authorization remains entirely server-side. */
export function PlatformAdminScoreExceptionLookup({ userId, en }: { userId: string; en: boolean }) {
  const location = useLocation();
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const validId = normalizeScoreExceptionEventId(input);

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get("score_event");
    const normalized = scoreExceptionEventFromSearch(location.search);
    setInput(requested === null ? "" : normalized ?? requested.slice(0, 64));
    setSelected(normalized);
    setAttempted(requested !== null && normalized === null);
    if (location.hash !== "#platform-admin-score-exceptions") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("platform-admin-score-exceptions")?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.key, location.search, location.hash]);

  return <div id="platform-admin-score-exceptions">
    <p className="muted small">{en
      ? "Choose Inspect score exceptions in Events, or enter an event ID below. Results are read-only and do not authorize score changes."
      : "可从赛事管理直接点击“查看比分异常”，也可在下方输入赛事 ID。查询仅供核查，不授权修改比分。"}</p>
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
