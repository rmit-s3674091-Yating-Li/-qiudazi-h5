/** Strict public response contract for the trusted high-risk photo removal Edge route. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function validPhotoRemovalReason(value: string): boolean {
  const reason = value.replace(/^ +| +$/g, "");
  const length = Array.from(reason).length;
  return length >= 10 && length <= 1000;
}

export type PhotoRemovalOperation = { payloadKey: string; id: string };

export function photoRemovalOperation(
  previous: PhotoRemovalOperation | null, payloadKey: string, createId: () => string,
): PhotoRemovalOperation {
  return previous?.payloadKey === payloadKey ? previous : { payloadKey, id: createId() };
}

export type PhotoRemovalResult = {
  photoId: string;
  eventId: string;
  cleanupPending: boolean;
  replayed: boolean;
};

export function parsePhotoRemovalResult(value: unknown, eventId: string, photoId: string): PhotoRemovalResult | null {
  if (!uuid.test(eventId) || !uuid.test(photoId) || !record(value) ||
      Object.keys(value).length !== 4 ||
      !["photo_id", "event_id", "cleanup_pending", "replayed"].every((key) => Object.hasOwn(value, key)) ||
      value.photo_id !== photoId || value.event_id !== eventId ||
      typeof value.cleanup_pending !== "boolean" || typeof value.replayed !== "boolean") return null;
  return { photoId, eventId, cleanupPending: value.cleanup_pending, replayed: value.replayed };
}
