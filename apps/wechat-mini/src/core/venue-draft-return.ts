import { prepareOfflineCourtPreview } from "./venue-court-draft.ts";

/** Local-only form return contract. Never a server permission or event write. */
export type OfflineFormContext = Readonly<{
  formKey: string;
  revision: number;
  screenEpoch: string;
  city: "北京" | "上海" | "成都";
}>;

type Ticket = Readonly<{
  sequence: number;
  issuedAtMs: number;
  context: OfflineFormContext;
}>;

type ReturnFields = Readonly<{
  city: OfflineFormContext["city"];
  venueName: string;
  venueAddress: string;
  venueSource: "manual" | "mock_poi";
  specificCourt: string | null;
  status: "DRAFT_ONLY";
}>;

export type ReturnDecision =
  | Readonly<{ status: "issued_mock_only"; ticket: Ticket }>
  | Readonly<{
      status: "draft_return_mock_only";
      verification: "OFFLINE_MOCK_ONLY";
      canPersist: false;
      fields: ReturnFields;
    }>
  | Readonly<{
      status: "blocked";
      reason:
        | "INVALID_CONTEXT"
        | "INVALID_CLOCK"
        | "STALE_OR_REPLAYED_TICKET"
        | "FORM_CHANGED"
        | "EXPIRED"
        | "INVALID_PREVIEW"
        | "CITY_MISMATCH";
    }>;

const TTL_MS = 10 * 60 * 1000;
const CITIES = new Set(["北京", "上海", "成都"]);
const token = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const validClock = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function contextOf(value: unknown): OfflineFormContext | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const c = value as Record<string, unknown>;
    if (
      !token(c.formKey) ||
      !token(c.screenEpoch) ||
      !Number.isSafeInteger(c.revision) ||
      (c.revision as number) < 0 ||
      !CITIES.has(c.city as string)
    )
      return null;
    return {
      formKey: c.formKey,
      revision: c.revision as number,
      screenEpoch: c.screenEpoch,
      city: c.city as OfflineFormContext["city"],
    };
  } catch {
    return null;
  }
}

function equalContext(a: OfflineFormContext, b: OfflineFormContext): boolean {
  return (
    a.formKey === b.formKey &&
    a.revision === b.revision &&
    a.screenEpoch === b.screenEpoch &&
    a.city === b.city
  );
}

/**
 * One-shot, in-memory return ticket for an offline venue picker. The parent
 * must increment revision whenever its city/form fields change, and use a new
 * screenEpoch after remount. This is NOT an identity/session generation.
 */
export class OfflineVenueReturnGate {
  private sequence = 0;
  private active: Ticket | null = null;

  invalidate(): void {
    this.active = null;
  }

  issue(rawContext: unknown, nowMs: unknown): ReturnDecision {
    this.invalidate();
    const context = contextOf(rawContext);
    if (!context) return { status: "blocked", reason: "INVALID_CONTEXT" };
    if (!validClock(nowMs))
      return { status: "blocked", reason: "INVALID_CLOCK" };
    const ticket: Ticket = Object.freeze({
      sequence: ++this.sequence,
      issuedAtMs: nowMs,
      context: Object.freeze(context),
    });
    this.active = ticket;
    return { status: "issued_mock_only", ticket };
  }

  accept(
    ticket: unknown,
    rawCurrentContext: unknown,
    rawPreview: unknown,
    nowMs: unknown,
  ): ReturnDecision {
    if (!this.active || ticket !== this.active)
      return { status: "blocked", reason: "STALE_OR_REPLAYED_TICKET" };
    const issued = this.active;
    // Fail closed and one-shot even if a malformed preview or clock is supplied.
    this.invalidate();
    const current = contextOf(rawCurrentContext);
    if (!current) return { status: "blocked", reason: "INVALID_CONTEXT" };
    if (!equalContext(issued.context, current))
      return { status: "blocked", reason: "FORM_CHANGED" };
    if (!validClock(nowMs) || nowMs < issued.issuedAtMs)
      return { status: "blocked", reason: "INVALID_CLOCK" };
    if (nowMs - issued.issuedAtMs > TTL_MS)
      return { status: "blocked", reason: "EXPIRED" };
    try {
      if (
        !rawPreview ||
        typeof rawPreview !== "object" ||
        Array.isArray(rawPreview)
      )
        return { status: "blocked", reason: "INVALID_PREVIEW" };
      const p = rawPreview as Record<string, unknown>;
      if (
        p.status !== "ready_mock_only" ||
        p.verification !== "OFFLINE_MOCK_ONLY" ||
        p.canPersist !== false
      )
        return { status: "blocked", reason: "INVALID_PREVIEW" };
      const value = p.preview;
      if (!value || typeof value !== "object" || Array.isArray(value))
        return { status: "blocked", reason: "INVALID_PREVIEW" };
      const v = value as Record<string, unknown>;
      if (v.city !== current.city)
        return { status: "blocked", reason: "CITY_MISMATCH" };
      if (v.specificCourt !== null && typeof v.specificCourt !== "string")
        return { status: "blocked", reason: "INVALID_PREVIEW" };
      const canonical = prepareOfflineCourtPreview(
        {
          city: v.city,
          name: v.venueName,
          address: v.venueAddress,
          source: v.venueSource,
          status: v.status,
        },
        v.specificCourt ?? "",
      );
      if (
        canonical.status !== "ready_mock_only" ||
        canonical.preview.specificCourt !== v.specificCourt
      )
        return { status: "blocked", reason: "INVALID_PREVIEW" };
      // Explicit allowlist: no coordinates, auth IDs, credentials or hidden metadata.
      return {
        status: "draft_return_mock_only",
        verification: "OFFLINE_MOCK_ONLY",
        canPersist: false,
        fields: { ...canonical.preview },
      };
    } catch {
      return { status: "blocked", reason: "INVALID_PREVIEW" };
    }
  }
}
