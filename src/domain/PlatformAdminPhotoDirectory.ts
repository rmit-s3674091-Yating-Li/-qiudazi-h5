/** Strict, event-scoped metadata-only contract for platform-admin-photos. */
export type AdminPhotoRow = {
  id: string;
  event_id: string;
  version: number;
  uploaded_at: string;
};
export type AdminPhotoCursor = { uploaded_at: string; id: string };
export type AdminPhotoPage = { items: AdminPhotoRow[]; nextCursor: AdminPhotoCursor | null };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zonedTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const fields = ["id", "event_id", "version", "uploaded_at"] as const;
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === "string" && uuid.test(v);
const validTime = (v: unknown): v is string =>
  typeof v === "string" && zonedTime.test(v) && Number.isFinite(Date.parse(v));
const exact = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));

export function parseAdminPhotoPage(value: unknown, eventId: string, pageSize = 20): AdminPhotoPage | null {
  if (!validId(eventId) || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      !record(value) || !exact(value, ["items", "next_cursor"]) ||
      !Array.isArray(value.items) || value.items.length > pageSize) return null;
  const items: AdminPhotoRow[] = [];
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || !exact(item, fields) ||
        !validId(item.id) || !validId(item.event_id) ||
        item.event_id.toLowerCase() !== eventId.toLowerCase() ||
        seen.has(item.id.toLowerCase()) ||
        typeof item.version !== "number" || !Number.isSafeInteger(item.version) || item.version < 1 ||
        !validTime(item.uploaded_at)) return null;
    seen.add(item.id.toLowerCase());
    items.push(item as AdminPhotoRow);
  }
  if (value.next_cursor === null) return { items, nextCursor: null };
  const cursor = value.next_cursor;
  if (!record(cursor) || !exact(cursor, ["uploaded_at", "id"]) ||
      !validTime(cursor.uploaded_at) || !validId(cursor.id) ||
      items.length !== pageSize ||
      cursor.id.toLowerCase() !== items[items.length - 1].id.toLowerCase() ||
      cursor.uploaded_at !== items[items.length - 1].uploaded_at) return null;
  return { items, nextCursor: { uploaded_at: cursor.uploaded_at, id: cursor.id } };
}
