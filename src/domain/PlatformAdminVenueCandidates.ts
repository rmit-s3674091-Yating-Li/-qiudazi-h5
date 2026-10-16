/** Read-only, unverified event-submitted venue leads. Never a verified venue registry. */
export type AdminVenueCandidateCursor = { created_at: string; event_id: string };
export type AdminVenueCandidate = {
  event_id: string;
  venue_name: string;
  city: string | null;
  event_version: number;
  created_at: string;
  verification_status: "not_verified";
};
export type AdminVenueCandidatePage = {
  items: AdminVenueCandidate[];
  nextCursor: AdminVenueCandidateCursor | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zonedTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const fields = ["event_id", "venue_name", "city", "event_version", "created_at", "verification_status"];
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === "string" && uuid.test(v);
const validTime = (v: unknown): v is string =>
  typeof v === "string" && zonedTime.test(v) && Number.isFinite(Date.parse(v));

/** Strictly project the Edge contract; any extra private field fails closed. */
export function parseAdminVenueCandidatePage(value: unknown, before: AdminVenueCandidateCursor | null = null): AdminVenueCandidatePage | null {
  if (before && (!validTime(before.created_at) || !validId(before.event_id))) return null;
  if (!isRecord(value) || Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "items") || !Object.hasOwn(value, "next_cursor") ||
      !Array.isArray(value.items) || value.items.length > 20) return null;
  const items: AdminVenueCandidate[] = [];
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!isRecord(item) || Object.keys(item).length !== fields.length ||
        Object.keys(item).some((field) => !fields.includes(field)) ||
        !validId(item.event_id) || seen.has(item.event_id.toLowerCase()) ||
        typeof item.venue_name !== "string" || !item.venue_name.trim() || item.venue_name.length > 500 ||
        !(item.city === null || (typeof item.city === "string" && item.city.length <= 200)) ||
        typeof item.event_version !== "number" || !Number.isSafeInteger(item.event_version) ||
        item.event_version < 1 || !validTime(item.created_at) ||
        item.verification_status !== "not_verified") return null;
    if (before) {
      const time = Date.parse(item.created_at), boundary = Date.parse(before.created_at);
      if (time > boundary || (time === boundary &&
          item.event_id.toLowerCase() >= before.event_id.toLowerCase())) return null;
    }
    if (items.length) {
      const previous = items[items.length - 1];
      const time = Date.parse(item.created_at), priorTime = Date.parse(previous.created_at);
      if (time > priorTime || (time === priorTime &&
          item.event_id.toLowerCase() >= previous.event_id.toLowerCase())) return null;
    }
    seen.add(item.event_id.toLowerCase());
    items.push(item as AdminVenueCandidate);
  }
  if (value.next_cursor === null) return { items, nextCursor: null };
  const cursor = value.next_cursor;
  if (!isRecord(cursor) || Object.keys(cursor).length !== 2 ||
      !Object.hasOwn(cursor, "created_at") || !Object.hasOwn(cursor, "event_id") ||
      !validTime(cursor.created_at) || !validId(cursor.event_id) ||
      items.length !== 20 ||
      cursor.created_at !== items[items.length - 1].created_at ||
      cursor.event_id.toLowerCase() !== items[items.length - 1].event_id.toLowerCase()) return null;
  return { items, nextCursor: { created_at: cursor.created_at, event_id: cursor.event_id } };
}
