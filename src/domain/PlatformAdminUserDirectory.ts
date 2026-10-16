/** Only the four non-sensitive profile fields exposed by platform-admin-users. */
export type AdminUserRow = {
  id: string;
  nickname: string | null;
  profile_status: string;
  created_at: string;
};
export type AdminUserCursor = { created_at: string; id: string };
export type AdminUserPage = { items: AdminUserRow[]; nextCursor: AdminUserCursor | null };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasExactly = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const timestamp = (value: unknown): value is string =>
  typeof value === "string" && isoWithZone.test(value) && Number.isFinite(Date.parse(value));

/** Preserve PostgreSQL's microsecond cursor precision across same-millisecond rows. */
function timestampMicros(value: string): bigint {
  const fractional = /\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  return BigInt(Date.parse(value)) * 1000n +
    BigInt(fractional.padEnd(6, "0").slice(3, 6));
}

function olderThan(a: AdminUserCursor, b: AdminUserCursor): boolean {
  const aTime = timestampMicros(a.created_at);
  const bTime = timestampMicros(b.created_at);
  return aTime < bTime || (aTime === bTime && a.id.toLowerCase() < b.id.toLowerCase());
}

/** A subsequent keyset page must be strictly behind the requested cursor. */
export function adminUserPageFollowsCursor(page: AdminUserPage, before: AdminUserCursor | null): boolean {
  return before === null || page.items.every((row) => olderThan(row, before));
}

/** Fail closed on any extra field (including email/auth metadata) or malformed cursor. */
export function parseAdminUserPage(value: unknown): AdminUserPage | null {
  if (!object(value) || !hasExactly(value, ["items", "next_cursor"]) ||
      !Array.isArray(value.items) || value.items.length > 20) return null;
  const items: AdminUserRow[] = [];
  const seen = new Set<string>();
  for (const row of value.items) {
    if (!object(row) || !hasExactly(row, ["id", "nickname", "profile_status", "created_at"]) ||
        typeof row.id !== "string" || !uuid.test(row.id) || seen.has(row.id.toLowerCase()) ||
        !(row.nickname === null || (typeof row.nickname === "string" && row.nickname.length <= 120)) ||
        typeof row.profile_status !== "string" || row.profile_status.length > 64 ||
        !timestamp(row.created_at)) return null;
    if (items.length && !olderThan(row as AdminUserRow, items[items.length - 1])) return null;
    seen.add(row.id.toLowerCase());
    items.push(row as AdminUserRow);
  }
  const cursor = value.next_cursor;
  if (cursor !== null && (!object(cursor) || !hasExactly(cursor, ["created_at", "id"]) ||
      !timestamp(cursor.created_at) || typeof cursor.id !== "string" || !uuid.test(cursor.id) ||
      items.length === 0 || cursor.id !== items[items.length - 1].id ||
      cursor.created_at !== items[items.length - 1].created_at)) return null;
  return { items, nextCursor: cursor as AdminUserCursor | null };
}
