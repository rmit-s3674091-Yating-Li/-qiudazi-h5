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
const zonedTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const fields = ["id", "event_id", "version", "uploaded_at"] as const;
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === "string" && uuid.test(v);
const validTime = (v: unknown): v is string =>
  typeof v === "string" && zonedTime.test(v) && Number.isFinite(Date.parse(v));
const exact = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const timestampMicros = (value: string): bigint => {
  const fraction = /\.(\d{1,6})(?=Z|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, "0").slice(3));
};
const comparePhotoCursor = (left: AdminPhotoCursor, right: AdminPhotoCursor): number => {
  const a=timestampMicros(left.uploaded_at), b=timestampMicros(right.uploaded_at);
  if(a!==b) return a>b ? -1 : 1;
  const l=left.id.toLowerCase(), r=right.id.toLowerCase();
  return l===r ? 0 : l>r ? -1 : 1;
};

export function parseAdminPhotoPage(value: unknown, eventId: string, pageSize = 20): AdminPhotoPage | null {
  if (!validId(eventId) || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      !record(value) || !exact(value, ["items", "next_cursor"]) ||
      !Array.isArray(value.items) || value.items.length > pageSize) return null;
  const items: AdminPhotoRow[] = [];
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || !exact(item, fields) || !validId(item.id) || !validId(item.event_id) ||
        item.event_id.toLowerCase() !== eventId.toLowerCase() || seen.has(item.id.toLowerCase()) ||
        typeof item.version !== "number" || !Number.isSafeInteger(item.version) || item.version < 1 ||
        !validTime(item.uploaded_at)) return null;
    if(items.length && comparePhotoCursor(item as AdminPhotoRow, items[items.length-1])<=0) return null;
    seen.add(item.id.toLowerCase());
    items.push(item as AdminPhotoRow);
  }
  if (value.next_cursor === null) return { items, nextCursor: null };
  const cursor = value.next_cursor;
  if (!record(cursor) || !exact(cursor, ["uploaded_at", "id"]) || !validTime(cursor.uploaded_at) || !validId(cursor.id) ||
      items.length !== pageSize || cursor.id.toLowerCase() !== items[items.length - 1].id.toLowerCase() ||
      cursor.uploaded_at !== items[items.length - 1].uploaded_at) return null;
  return { items, nextCursor: { uploaded_at: cursor.uploaded_at, id: cursor.id } };
}

export function validAdminPhotoPageBoundary(
  page: AdminPhotoPage,
  before: AdminPhotoCursor | null,
  previous: readonly AdminPhotoRow[],
): boolean {
  const previousIds=new Set(previous.map(row=>row.id.toLowerCase()));
  if(previous.length && !before) return false;
  if(before && previous.length){
    const last=previous[previous.length-1];
    if(before.uploaded_at!==last.uploaded_at || before.id.toLowerCase()!==last.id.toLowerCase()) return false;
  }
  let anchor=before;
  for(const row of page.items){
    if(previousIds.has(row.id.toLowerCase())) return false;
    const current={uploaded_at:row.uploaded_at,id:row.id};
    if(anchor && comparePhotoCursor(current,anchor)<=0) return false;
    anchor=current;
  }
  return true;
}
