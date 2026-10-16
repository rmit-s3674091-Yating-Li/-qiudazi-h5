/** Narrow runtime contract for the authorized platform-admin-audit Edge response. */
export type AuditCursor = { created_at: string; id: string };
export type AuditRow = {
  id: string;
  actor_auth_user_id: string;
  action: string;
  target_kind: string;
  target_id: string;
  reason: string;
  risk_level: "low" | "high";
  created_at: string;
};
export type AuditPage = { items: AuditRow[]; nextCursor: AuditCursor | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const timestamp = (value: unknown): value is string =>
  typeof value === "string" && isoWithZone.test(value) && Number.isFinite(Date.parse(value));
const validCursor = (value: unknown): value is AuditCursor =>
  record(value) && timestamp(value.created_at) && typeof value.id === "string" && uuid.test(value.id);
const shortText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

// PostgreSQL cursors have microsecond precision. Date.parse alone truncates
// sub-millisecond ordering and can accept repeated/overlapping pages.
function timestampNanoseconds(value: string): bigint {
  const fraction = /\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  const wholeSeconds = value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, "");
  return BigInt(Date.parse(wholeSeconds)) * 1_000_000n +
    BigInt(fraction.padEnd(9, "0").slice(0, 9) || "0");
}

/** Mirrors ORDER BY created_at DESC, id DESC in platform_admin_list_audit. */
function strictlyBefore(newer: AuditCursor, older: AuditCursor): boolean {
  const left = timestampNanoseconds(newer.created_at);
  const right = timestampNanoseconds(older.created_at);
  return left > right || (left === right && newer.id.toLowerCase() > older.id.toLowerCase());
}

/** Fail closed if a route or RPC accidentally changes its response contract. */
export function parseAdminAuditPage(
  value: unknown,
  before: AuditCursor | null = null,
  previousIds: ReadonlySet<string> = new Set(),
): AuditPage | null {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 50) return null;
  if (!Object.hasOwn(value, "next_cursor") ||
      (value.next_cursor !== null && !validCursor(value.next_cursor)) ||
      (before !== null && !validCursor(before))) return null;
  const items: AuditRow[] = [];
  const seen = new Set(previousIds);
  let previous = before;
  for (const row of value.items) {
    if (!record(row) || typeof row.id !== "string" || !uuid.test(row.id) ||
        typeof row.actor_auth_user_id !== "string" || !uuid.test(row.actor_auth_user_id) ||
        !shortText(row.action, 80) || !shortText(row.target_kind, 80) ||
        !shortText(row.target_id, 128) || !shortText(row.reason, 1000) ||
        (row.risk_level !== "low" && row.risk_level !== "high") ||
        !timestamp(row.created_at) || seen.has(row.id)) return null;
    const position = { created_at: row.created_at, id: row.id };
    if (previous && !strictlyBefore(previous, position)) return null;
    seen.add(row.id);
    previous = position;
    items.push(row as AuditRow);
  }
  const cursor = value.next_cursor as AuditCursor | null;
  if (cursor !== null && (items.length === 0 ||
      cursor.id !== previous?.id || cursor.created_at !== previous.created_at)) return null;
  return { items, nextCursor: cursor };
}
