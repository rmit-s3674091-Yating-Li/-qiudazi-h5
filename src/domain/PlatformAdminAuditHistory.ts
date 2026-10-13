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

/** Fail closed if a route or RPC accidentally changes its response contract. */
export function parseAdminAuditPage(value: unknown): AuditPage | null {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 50) return null;
  if (value.next_cursor !== null && !validCursor(value.next_cursor)) return null;
  const items: AuditRow[] = [];
  for (const row of value.items) {
    if (!record(row) || typeof row.id !== "string" || !uuid.test(row.id) ||
        typeof row.actor_auth_user_id !== "string" || !uuid.test(row.actor_auth_user_id) ||
        !shortText(row.action, 80) || !shortText(row.target_kind, 80) ||
        !shortText(row.target_id, 128) || !shortText(row.reason, 1000) ||
        (row.risk_level !== "low" && row.risk_level !== "high") ||
        !timestamp(row.created_at)) return null;
    items.push(row as AuditRow);
  }
  return { items, nextCursor: value.next_cursor as AuditCursor | null };
}
