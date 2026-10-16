/** Strict metadata-only contract for the platform-admin-reports Edge endpoint. */
export type AdminReportStatus = "open" | "in_review" | "resolved" | "dismissed";
export type AdminReportCategory = "safety" | "conduct" | "spam" | "privacy" | "other";
export type AdminReportTarget = "user" | "event" | "match" | "photo";
export type AdminReportRow = {
  id: string;
  target_kind: AdminReportTarget;
  target_id: string;
  category: AdminReportCategory;
  status: AdminReportStatus;
  version: number;
  created_at: string;
};
export type AdminReportCursor = { created_at: string; id: string };
export type AdminReportPage = { items: AdminReportRow[]; nextCursor: AdminReportCursor | null };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zonedTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const fields = ["id", "target_kind", "target_id", "category", "status", "version", "created_at"] as const;
const statuses = ["open", "in_review", "resolved", "dismissed"] as const;
const categories = ["safety", "conduct", "spam", "privacy", "other"] as const;
const targets = ["user", "event", "match", "photo"] as const;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const validId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const fractionDigits = (value: string) =>
  value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/)?.[1] ?? "";
const validTime = (value: unknown): value is string =>
  typeof value === "string" && zonedTime.test(value) && Number.isFinite(Date.parse(value)) &&
  fractionDigits(value).length <= 6;
/** PostgreSQL timestamptz uses microseconds; Date.parse alone truncates to milliseconds. */
const earlierThan = (left: AdminReportCursor, right: AdminReportCursor): boolean => {
  const a = Date.parse(left.created_at);
  const b = Date.parse(right.created_at);
  if (a !== b) return a < b;
  const aMicros = Number(fractionDigits(left.created_at).padEnd(6, "0").slice(3));
  const bMicros = Number(fractionDigits(right.created_at).padEnd(6, "0").slice(3));
  if (aMicros !== bMicros) return aMicros < bMicros;
  return left.id.toLowerCase() < right.id.toLowerCase();
};
const oneOf = <T extends string>(value: unknown, choices: readonly T[]): value is T =>
  typeof value === "string" && choices.includes(value as T);

/** Reject unexpected keys, private narratives, reporter IDs and inconsistent pagination. */
export function parseAdminReportPage(
  value: unknown,
  selectedStatus: AdminReportStatus | null,
  pageSize = 20,
  before: AdminReportCursor | null = null,
): AdminReportPage | null {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      (selectedStatus !== null && !oneOf(selectedStatus, statuses)) ||
      (before !== null && (!record(before) || !exact(before, ["created_at", "id"]) ||
        !validTime(before.created_at) || !validId(before.id))) ||
      !record(value) || !exact(value, ["items", "next_cursor"]) ||
      !Array.isArray(value.items) || value.items.length > pageSize) return null;
  const items: AdminReportRow[] = [];
  const seen = new Set<string>();
  let previous: AdminReportCursor | null = before;
  for (const item of value.items) {
    if (!record(item) || !exact(item, fields) || !validId(item.id) ||
        !validId(item.target_id) || seen.has(item.id.toLowerCase()) ||
        !oneOf(item.target_kind, targets) || !oneOf(item.category, categories) ||
        !oneOf(item.status, statuses) || (selectedStatus !== null && item.status !== selectedStatus) ||
        typeof item.version !== "number" || !Number.isSafeInteger(item.version) || item.version < 1 ||
        !validTime(item.created_at)) return null;
    const current = { id: item.id, created_at: item.created_at };
    if (previous && !earlierThan(current, previous)) return null;
    seen.add(item.id.toLowerCase());
    items.push(item as AdminReportRow);
    previous = current;
  }
  if (value.next_cursor === null) return { items, nextCursor: null };
  const cursor = value.next_cursor;
  if (!record(cursor) || !exact(cursor, ["created_at", "id"]) ||
      !validTime(cursor.created_at) || !validId(cursor.id) || items.length !== pageSize ||
      cursor.id.toLowerCase() !== items[items.length - 1].id.toLowerCase() ||
      cursor.created_at !== items[items.length - 1].created_at) return null;
  return { items, nextCursor: { created_at: cursor.created_at, id: cursor.id } };
}
