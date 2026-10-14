import { useState } from "react";
import type { FormEvent } from "react";
import { validAdminPhotoId } from "../domain/PlatformAdminPhotoPreview";
import { PlatformAdminPhotoDirectory } from "./PlatformAdminPhotoDirectory";

/** Read-only review entry. Parent unmounts it whenever admin role revalidation starts. */
export function PlatformAdminPhotoReview({ userId, en }: { userId: string; en: boolean }) {
  const [draftEventId, setDraftEventId] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  function openEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = draftEventId.trim();
    if (!validAdminPhotoId(candidate)) {
      setEventId(null);
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setEventId(candidate.toLowerCase());
  }

  return <div>
    <p className="muted small">{en
      ? "Read-only event photo review. Copy an event ID from the event directory. Every photo and preview request is checked by the server."
      : "赛事照片只读审核。可从赛事目录复制赛事 ID；照片列表和预览均由服务端独立核验权限。"}</p>
    <form onSubmit={openEvent}>
      <label htmlFor="platform-admin-photo-event-id">{en ? "Event ID" : "赛事 ID"}</label>
      <input id="platform-admin-photo-event-id" type="text" value={draftEventId}
        autoComplete="off" spellCheck={false} maxLength={36}
        aria-invalid={invalid} aria-describedby={invalid ? "platform-admin-photo-event-error" : undefined}
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        onChange={(event) => {
          setDraftEventId(event.target.value);
          setEventId(null);
          setInvalid(false);
        }} />
      {invalid && <p id="platform-admin-photo-event-error" className="error" role="alert">{en
        ? "Enter a valid event ID from the event directory."
        : "请输入赛事目录中的有效赛事 ID。"}</p>}
      <button type="submit" className="secondary" disabled={!draftEventId.trim()}>
        {en ? "Load event photos" : "查看赛事照片"}
      </button>
    </form>
    {eventId && <PlatformAdminPhotoDirectory key={`${userId}:${eventId}`}
      userId={userId} eventId={eventId} en={en} />}
  </div>;
}
