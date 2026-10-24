/** Strict metadata-only contract for the trusted platform-admin-feedback Edge route. */
export type AdminFeedbackStatus = "open" | "in_review" | "resolved" | "dismissed";
export type AdminFeedbackCategory = "bug" | "experience" | "accessibility" | "other";
export type AdminFeedbackCursor = { created_at: string; id: string };
export type AdminFeedbackRow = {
  id: string;
  category: AdminFeedbackCategory;
  status: AdminFeedbackStatus;
  version: number;
  created_at: string;
};
export type AdminFeedbackPage = { items: AdminFeedbackRow[]; nextCursor: AdminFeedbackCursor | null };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zonedTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const statuses: readonly AdminFeedbackStatus[] = ["open", "in_review", "resolved", "dismissed"];
const categories: readonly AdminFeedbackCategory[] = ["bug", "experience", "accessibility", "other"];
const fields = ["id", "category", "status", "version", "created_at"] as const;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const validId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const validTime = (value: unknown): value is string =>
  typeof value === "string" && zonedTime.test(value) && Number.isFinite(Date.parse(value));
const oneOf = <T extends string>(value: unknown, choices: readonly T[]): value is T =>
  typeof value === "string" && choices.includes(value as T);
/** Preserve PostgreSQL's microsecond keyset ordering, including timezone offsets. */
const timestampMicros = (value: string): bigint => {
  const fraction = /\.(\d{1,6})(?=Z|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, "0").slice(3));
};
const earlierThan = (left: AdminFeedbackCursor, right: AdminFeedbackCursor): boolean => {
  const a = timestampMicros(left.created_at);
  const b = timestampMicros(right.created_at);
  return a < b || (a === b && left.id.toLowerCase() < right.id.toLowerCase());
};

/** Reject extra keys, sensitive feedback text, out-of-order pages and invalid cursors. */
export function parseAdminFeedbackPage(
  value: unknown,
  selectedStatus: AdminFeedbackStatus | null,
  pageSize = 20,
  before: AdminFeedbackCursor | null = null,
): AdminFeedbackPage | null {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      (selectedStatus !== null && !oneOf(selectedStatus, statuses)) ||
      (before !== null && (!record(before) || !exact(before, ["created_at", "id"]) ||
        !validTime(before.created_at) || !validId(before.id))) ||
      !record(value) || !exact(value, ["items", "next_cursor"]) ||
      !Array.isArray(value.items) || value.items.length > pageSize) return null;
  const items: AdminFeedbackRow[] = [];
  const seen = new Set<string>();
  let previous: AdminFeedbackCursor | null = before;
  for (const item of value.items) {
    if (!record(item) || !exact(item, fields) || !validId(item.id) ||
        seen.has(item.id.toLowerCase()) || !oneOf(item.category, categories) ||
        !oneOf(item.status, statuses) || (selectedStatus !== null && item.status !== selectedStatus) ||
        typeof item.version !== "number" || !Number.isSafeInteger(item.version) || item.version < 1 ||
        !validTime(item.created_at)) return null;
    const current = { id: item.id, created_at: item.created_at };
    if (previous && !earlierThan(current, previous)) return null;
    seen.add(item.id.toLowerCase());
    items.push(item as AdminFeedbackRow);
    previous = current;
  }
  if (value.next_cursor === null) return { items, nextCursor: null };
  const cursor = value.next_cursor;
  if (!record(cursor) || !exact(cursor, ["created_at", "id"]) ||
      !validTime(cursor.created_at) || !validId(cursor.id) || items.length !== pageSize ||
      cursor.created_at !== items[items.length - 1].created_at ||
      cursor.id.toLowerCase() !== items[items.length - 1].id.toLowerCase()) return null;
  return { items, nextCursor: { created_at: cursor.created_at, id: cursor.id } };
}
