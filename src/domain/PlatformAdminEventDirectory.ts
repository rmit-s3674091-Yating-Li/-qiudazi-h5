/** Narrow read-only contract for the platform-admin-events Edge endpoint. */
export type AdminEventStatus = "signup" | "locked" | "ongoing" | "finished" | "cancelled";
export type AdminEventCursor = { created_at: string; id: string };
export type AdminEventRow = {
  id: string;
  name: string;
  owner_user_id: string;
  status: AdminEventStatus;
  version: number;
  visibility: "public" | "private";
  event_mode: "standard" | "quick";
  match_type: "singles" | "doubles";
  format: "round_robin" | "knockout" | "group_knockout";
  city: string | null;
  event_date: string | null;
  created_at: string;
};
export type AdminEventPage = { items: AdminEventRow[]; nextCursor: AdminEventCursor | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zonedTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const statuses: readonly string[] = ["signup", "locked", "ongoing", "finished", "cancelled"];
const fields = ["id", "name", "owner_user_id", "status", "version", "visibility", "event_mode", "match_type", "format", "city", "event_date", "created_at"];
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const validTime = (v: unknown): v is string => typeof v === "string" && zonedTime.test(v) && Number.isFinite(Date.parse(v));
const validId = (v: unknown): v is string => typeof v === "string" && uuid.test(v);
const oneOf = (v: unknown, values: readonly string[]): v is string => typeof v === "string" && values.includes(v);
const validDate = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && dateOnly.test(v) &&
    !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
    new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v);
const validCursor = (v: unknown): v is AdminEventCursor =>
  record(v) && Object.keys(v).length === 2 && validTime(v.created_at) && validId(v.id);

/** Reject unexpected fields (including future sensitive fields) instead of silently displaying them. */
export function parseAdminEventPage(value: unknown): AdminEventPage | null {
  if (!record(value) || Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "items") || !Object.hasOwn(value, "next_cursor") ||
      !Array.isArray(value.items) || value.items.length > 20) return null;
  const items: AdminEventRow[] = [];
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || Object.keys(item).length !== fields.length ||
        Object.keys(item).some((key) => !fields.includes(key)) ||
        !validId(item.id) || seen.has(item.id) || !validId(item.owner_user_id) ||
        typeof item.name !== "string" || item.name.length < 1 || item.name.length > 80 ||
        !oneOf(item.status, statuses) ||
        typeof item.version !== "number" || !Number.isSafeInteger(item.version) || item.version < 1 ||
        !oneOf(item.visibility, ["public", "private"]) ||
        !oneOf(item.event_mode, ["standard", "quick"]) ||
        !oneOf(item.match_type, ["singles", "doubles"]) ||
        !oneOf(item.format, ["round_robin", "knockout", "group_knockout"]) ||
        !(item.city === null || (typeof item.city === "string" && item.city.length <= 120)) ||
        !validDate(item.event_date) || !validTime(item.created_at)) return null;
    seen.add(item.id);
    items.push(item as AdminEventRow);
  }
  if (value.next_cursor === null) return { items, nextCursor: null };
  if (!validCursor(value.next_cursor) || items.length === 0) return null;
  const last = items[items.length - 1];
  if (value.next_cursor.id !== last.id || value.next_cursor.created_at !== last.created_at) return null;
  return { items, nextCursor: value.next_cursor };
}
