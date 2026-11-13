/**
 * Offline-only, pre-persistence fence for a future session refresh adapter.
 * It never accepts tokens, calls Supabase, or establishes a verified session.
 * The real adapter MUST stage a refreshed credential without persisting it,
 * then revalidate its trusted actor and this ticket immediately BEFORE any
 * credential write. SDKs that auto-persist on refresh need separate review.
 * SESSION_BRIDGE_UNPROVEN remains in force.
 */
export type RefreshActor = Readonly<{
  authUserId: string;
  profileId: string;
  epoch: string;
  generation: number;
}>;

type RefreshTicket = Readonly<{
  sequence: number;
  issuedAtMs: number;
}>;

type BeginResult =
  | Readonly<{ status: "TICKET_MOCK_ONLY"; ticket: RefreshTicket }>
  | Readonly<{ status: "BLOCKED"; reason: "INVALID_ACTOR" | "INVALID_CLOCK" }>;

export type CompleteResult =
  | Readonly<{ status: "ELIGIBLE_MOCK_ONLY" }>
  | Readonly<{
      status: "BLOCKED";
      reason:
        | "STALE_OR_REPLAYED"
        | "INVALID_ACTOR"
        | "ACTOR_CHANGED"
        | "INVALID_CLOCK"
        | "EXPIRED";
    }>;

type ActiveRefresh = Readonly<{
  ticket: RefreshTicket;
  actor: RefreshActor;
}>;

const actorKeys = ["authUserId", "profileId", "epoch", "generation"] as const;
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validClock = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Copies only own DATA properties once. Inherited/accessor/extra keys fail closed. */
function actorSnapshot(value: unknown): RefreshActor | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== actorKeys.length ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          !actorKeys.includes(key as (typeof actorKeys)[number]),
      )
    )
      return null;
    for (const key of actorKeys) {
      if (
        !Object.hasOwn(descriptors, key) ||
        !descriptors[key].enumerable ||
        !Object.hasOwn(descriptors[key], "value")
      )
        return null;
    }
    const authUserId: unknown = descriptors.authUserId.value;
    const profileId: unknown = descriptors.profileId.value;
    const epoch: unknown = descriptors.epoch.value;
    const generation: unknown = descriptors.generation.value;
    if (
      !validId(authUserId) ||
      !validId(profileId) ||
      !validId(epoch) ||
      typeof generation !== "number" ||
      !Number.isSafeInteger(generation) ||
      generation < 0
    )
      return null;
    return Object.freeze({ authUserId, profileId, epoch, generation });
  } catch {
    return null;
  }
}

function sameActor(a: RefreshActor, b: RefreshActor): boolean {
  return (
    a.authUserId === b.authUserId &&
    a.profileId === b.profileId &&
    a.epoch === b.epoch &&
    a.generation === b.generation
  );
}

/**
 * One in-flight refresh at a time. A new begin invalidates the old ticket;
 * sign-out/account-switch MUST call invalidate() before clearing credentials.
 * This is a local race fence, NOT an authorization or JWT verification API.
 */
export class OfflineRefreshCommitGate {
  private active: ActiveRefresh | null = null;
  private sequence = 0;
  private readonly ttlMs: number;

  constructor(ttlMs = 30_000) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1)
      throw new Error("INVALID_TTL");
    this.ttlMs = ttlMs;
  }

  invalidate(): void {
    this.active = null;
  }

  begin(rawActor: unknown, nowMs: unknown): BeginResult {
    this.invalidate();
    const actor = actorSnapshot(rawActor);
    if (!actor) return { status: "BLOCKED", reason: "INVALID_ACTOR" };
    if (!validClock(nowMs) || !Number.isSafeInteger(nowMs + this.ttlMs))
      return { status: "BLOCKED", reason: "INVALID_CLOCK" };
    const ticket = Object.freeze({
      sequence: ++this.sequence,
      issuedAtMs: nowMs,
    });
    this.active = { ticket, actor };
    return { status: "TICKET_MOCK_ONLY", ticket };
  }

  complete(
    ticket: unknown,
    rawCurrentActor: unknown,
    nowMs: unknown,
  ): CompleteResult {
    if (!this.active || ticket !== this.active.ticket)
      return { status: "BLOCKED", reason: "STALE_OR_REPLAYED" };
    const active = this.active;
    // Burn ticket before any validation; even malformed results cannot be retried.
    this.invalidate();
    const current = actorSnapshot(rawCurrentActor);
    if (!current) return { status: "BLOCKED", reason: "INVALID_ACTOR" };
    if (!sameActor(active.actor, current))
      return { status: "BLOCKED", reason: "ACTOR_CHANGED" };
    if (!validClock(nowMs) || nowMs < active.ticket.issuedAtMs)
      return { status: "BLOCKED", reason: "INVALID_CLOCK" };
    if (nowMs - active.ticket.issuedAtMs >= this.ttlMs)
      return { status: "BLOCKED", reason: "EXPIRED" };
    return { status: "ELIGIBLE_MOCK_ONLY" };
  }
}
