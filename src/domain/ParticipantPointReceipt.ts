import type { Snapshot } from "./types.ts";

type ReceiptRequest = Readonly<{
  eventId: string;
  matchId: string;
  operationId: string;
  side: "A" | "B";
  expectedEventVersion: number;
  expectedMatchVersion: number;
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const versionAtLeast = (value: unknown, minimum: number): boolean =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;

/**
 * The trusted point RPC may return a newer snapshot on an idempotent replay.
 * Never report HTTP 200 for a null/malformed RPC result or a snapshot that
 * does not contain the exact committed operation. This is response integrity,
 * not a replacement for the transaction's actor and operation-id checks.
 */
export function isParticipantPointReceipt(value: unknown, request: ReceiptRequest): value is Snapshot {
  if (!record(value) || !record(value.event) || value.viewer_role !== "participant" ||
      !Array.isArray(value.entries) || !Array.isArray(value.matches) ||
      !Array.isArray(value.set_scores) || !Array.isArray(value.point_logs) ||
      !(value.photo === null || record(value.photo))) return false;

  if (value.event.id !== request.eventId ||
      !versionAtLeast(value.event.version, request.expectedEventVersion + 1)) return false;

  const matches = value.matches.filter((item: unknown) =>
    record(item) && item.id === request.matchId && item.event_id === request.eventId);
  if (matches.length !== 1 ||
      !versionAtLeast(matches[0].version, request.expectedMatchVersion + 1)) return false;

  const points = value.point_logs.filter((item: unknown) =>
    record(item) && item.id === request.operationId);
  return points.length === 1 && points[0].match_id === request.matchId &&
    points[0].winner_side === request.side;
}
