import {
  OfflineVenueReturnGate,
  type OfflineFormContext,
  type ReturnDecision,
} from "./venue-draft-return.ts";

/**
 * Offline route handoff for a future TWO-PAGE Taro venue picker.
 * The route contains only a non-authorizing opaque label; the draft, actor,
 * coordinates and credentials never enter the query string or persistent storage.
 * No real Taro navigation is performed by this pure-TS module.
 */
const ROUTE_PATH = "/pages/venue-route-poc/index";
const TTL_MS = 10 * 60 * 1000;
let nextRouteSequence = 0;

type GateTicket = Extract<
  ReturnDecision,
  { status: "issued_mock_only" }
>["ticket"];
type Handle = Readonly<{ readonly kind: "offline-venue-claim" }>;

type Active = {
  label: string;
  issuedAtMs: number;
  ticket: GateTicket;
  claimed: boolean;
  handle: Handle | null;
};

export type VenueNavigationDecision =
  | Readonly<{
      status: "route_mock_only";
      url: string;
      verification: "OFFLINE_MOCK_ONLY";
      canPersist: false;
    }>
  | Readonly<{
      status: "claimed_mock_only";
      city: OfflineFormContext["city"];
      handle: Handle;
      verification: "OFFLINE_MOCK_ONLY";
      canPersist: false;
    }>
  | Readonly<{
      status: "draft_return_mock_only";
      fields: Extract<
        ReturnDecision,
        { status: "draft_return_mock_only" }
      >["fields"];
      verification: "OFFLINE_MOCK_ONLY";
      canPersist: false;
    }>
  | Readonly<{
      status: "blocked";
      reason:
        | "NO_ACTIVE_ROUTE"
        | "INVALID_ROUTE_OPTIONS"
        | "ROUTE_MISMATCH"
        | "ALREADY_CLAIMED"
        | "INVALID_CLOCK"
        | "EXPIRED"
        | "INVALID_CLAIM"
        | Extract<ReturnDecision, { status: "blocked" }>["reason"];
    }>;

const validClock = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Taro onLoad options must contain exactly one scalar handoff label. */
function parseOptions(value: unknown): string | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return null;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
    const keys = Object.keys(value);
    if (keys.length !== 1 || keys[0] !== "handoff") return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, "handoff");
    if (!descriptor || !("value" in descriptor)) return null;
    const label = descriptor.value;
    return typeof label === "string" && /^nav-[1-9][0-9]{0,14}$/.test(label)
      ? label
      : null;
  } catch {
    return null;
  }
}

/**
 * One active handoff per channel. A page reload/new JS runtime loses the
 * channel and therefore fails closed. A parent edit must call cancel().
 * A caller must share ONE channel instance across the parent/child pages.
 */
export class OfflineVenueNavigationBridge {
  private readonly gate = new OfflineVenueReturnGate();
  private active: Active | null = null;

  cancel(): void {
    this.active = null;
    this.gate.invalidate();
  }

  issue(context: unknown, nowMs: unknown): VenueNavigationDecision {
    this.cancel();
    const result = this.gate.issue(context, nowMs);
    if (result.status !== "issued_mock_only") {
      return {
        status: "blocked",
        reason: result.status === "blocked" ? result.reason : "INVALID_CONTEXT",
      };
    }
    // This is a local correlation label, NOT a bearer token or authorization.
    const label = `nav-${++nextRouteSequence}`;
    this.active = {
      label,
      issuedAtMs: result.ticket.issuedAtMs,
      ticket: result.ticket,
      claimed: false,
      handle: null,
    };
    return {
      status: "route_mock_only",
      url: `${ROUTE_PATH}?handoff=${label}`,
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
    };
  }

  claim(options: unknown, nowMs: unknown): VenueNavigationDecision {
    const active = this.active;
    if (!active) return { status: "blocked", reason: "NO_ACTIVE_ROUTE" };
    if (!validClock(nowMs) || nowMs < active.issuedAtMs) {
      this.cancel();
      return { status: "blocked", reason: "INVALID_CLOCK" };
    }
    if (nowMs - active.issuedAtMs > TTL_MS) {
      this.cancel();
      return { status: "blocked", reason: "EXPIRED" };
    }
    const label = parseOptions(options);
    if (!label) return { status: "blocked", reason: "INVALID_ROUTE_OPTIONS" };
    if (label !== active.label)
      return { status: "blocked", reason: "ROUTE_MISMATCH" };
    if (active.claimed) return { status: "blocked", reason: "ALREADY_CLAIMED" };
    active.claimed = true;
    // Object identity is never encoded into the URL or persisted.
    const handle: Handle = Object.freeze({ kind: "offline-venue-claim" });
    active.handle = handle;
    return {
      status: "claimed_mock_only",
      city: active.ticket.context.city,
      handle,
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
    };
  }

  finish(
    handle: unknown,
    currentContext: unknown,
    preview: unknown,
    nowMs: unknown,
  ): VenueNavigationDecision {
    const active = this.active;
    if (!active || !active.claimed || handle !== active.handle)
      return { status: "blocked", reason: "INVALID_CLAIM" };
    // Consume before validating the preview; malformed data cannot be retried.
    this.active = null;
    const result = this.gate.accept(
      active.ticket,
      currentContext,
      preview,
      nowMs,
    );
    if (result.status !== "draft_return_mock_only") {
      return {
        status: "blocked",
        reason: result.status === "blocked" ? result.reason : "INVALID_PREVIEW",
      };
    }
    return {
      status: "draft_return_mock_only",
      fields: { ...result.fields },
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
    };
  }
}
