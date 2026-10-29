import type { ActorScope, KeyValuePort, SessionPort } from "./ports.ts";

/**
 * Gate-0 cache isolation only. NOT an Auth implementation or a permission check.
 * A verified SessionPort and a NEW epoch on every sign-out/account switch are
 * mandatory before using this with real, non-secret business view data.
 */
export type CacheRead<T> =
  | Readonly<{ status: "READY"; value: T }>
  | Readonly<{
      status:
        | "UNVERIFIED"
        | "STALE_ACTOR"
        | "NOT_FOUND"
        | "EXPIRED"
        | "INVALID_CACHE"
        | "STORAGE_ERROR";
    }>;
export type CacheWrite = Readonly<{
  status:
    | "STORED"
    | "UNVERIFIED"
    | "STALE_ACTOR"
    | "INVALID_VALUE"
    | "STORAGE_ERROR";
}>;

type CacheEnvelope = Readonly<{
  version: 1;
  actor: ActorScope;
  createdAt: number;
  expiresAt: number;
  value: unknown;
}>;

const keyPattern = /^[a-z][a-z0-9_-]{1,31}$/;
const forbiddenFields = new Set([
  "accesstoken",
  "refreshtoken",
  "authorization",
  "jwt",
  "password",
  "sessionkey",
  "tokenhash",
  "logincode",
  "appsecret",
  "clientsecret",
  "secret",
  "idtoken",
  "token",
  "bearer",
]);
const MAX_JSON_LENGTH = 16_384;

function validActor(value: unknown): value is ActorScope {
  if (!value || typeof value !== "object") return false;
  try {
    const actor = value as Partial<ActorScope>;
    return [actor.authUserId, actor.profileId, actor.epoch].every(
      (field) =>
        typeof field === "string" &&
        field.length > 0 &&
        field.length <= 256 &&
        field.trim() === field,
    );
  } catch {
    return false;
  }
}

function copyActor(actor: ActorScope): ActorScope {
  return {
    authUserId: actor.authUserId,
    profileId: actor.profileId,
    epoch: actor.epoch,
  };
}
function sameActor(a: ActorScope, b: ActorScope): boolean {
  return (
    a.authUserId === b.authUserId &&
    a.profileId === b.profileId &&
    a.epoch === b.epoch
  );
}

/** Reject accessors, custom prototypes, cycles and credential-looking keys. */
function safeJson(value: unknown): string | null {
  const visited = new Set<object>();
  let nodes = 0;
  function visit(input: unknown, depth: number): unknown {
    if (++nodes > 1024 || depth > 12) throw new Error("INVALID_CACHE_VALUE");
    if (
      input === null ||
      typeof input === "boolean" ||
      typeof input === "string"
    )
      return input;
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (!input || typeof input !== "object" || visited.has(input))
      throw new Error("INVALID_CACHE_VALUE");
    visited.add(input);
    if (Array.isArray(input) && input.length > 1024)
      throw new Error("INVALID_CACHE_VALUE");
    const proto = Object.getPrototypeOf(input);
    if (!Array.isArray(input) && proto !== Object.prototype && proto !== null)
      throw new Error("INVALID_CACHE_VALUE");
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const result: unknown = Array.isArray(input) ? [] : Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (
        typeof key !== "string" ||
        key === "__proto__" ||
        key === "constructor" ||
        key === "prototype" ||
        forbiddenFields.has(key.replace(/[_-]/g, "").toLowerCase())
      )
        throw new Error("INVALID_CACHE_VALUE");
      const descriptor = descriptors[key];
      if (Array.isArray(input) && key === "length") continue;
      if (!descriptor.enumerable || !("value" in descriptor))
        throw new Error("INVALID_CACHE_VALUE");
      if (Array.isArray(input)) {
        if (!/^(0|[1-9][0-9]*)$/.test(key))
          throw new Error("INVALID_CACHE_VALUE");
        (result as unknown[])[Number(key)] = visit(descriptor.value, depth + 1);
      } else {
        (result as Record<string, unknown>)[key] = visit(
          descriptor.value,
          depth + 1,
        );
      }
    }
    if (Array.isArray(input) && (result as unknown[]).length !== input.length)
      throw new Error("INVALID_CACHE_VALUE");
    visited.delete(input);
    return result;
  }
  try {
    const serialized = JSON.stringify(visit(value, 0));
    return serialized && serialized.length <= MAX_JSON_LENGTH
      ? serialized
      : null;
  } catch {
    return null;
  }
}

export class ActorScopedCache {
  private readonly storageKey: string;
  private readonly storage: KeyValuePort;
  private readonly session: Pick<SessionPort, "getVerifiedActor">;
  private readonly now: () => number;
  private readonly ttlMs: number;
  constructor(
    storage: KeyValuePort,
    session: Pick<SessionPort, "getVerifiedActor">,
    namespace: string,
    item: string,
    now: () => number = Date.now,
    ttlMs = 300_000,
  ) {
    if (
      !keyPattern.test(namespace) ||
      !keyPattern.test(item) ||
      !Number.isSafeInteger(ttlMs) ||
      ttlMs < 1 ||
      ttlMs > 86_400_000
    )
      throw new Error("INVALID_CACHE_CONFIG");
    this.storage = storage;
    this.session = session;
    this.now = now;
    this.ttlMs = ttlMs;
    // No identity or credential is embedded in a platform storage key.
    this.storageKey = `qiudazi:poc:${namespace}:${item}`;
  }

  private async actor(): Promise<ActorScope | null> {
    try {
      const value = await this.session.getVerifiedActor();
      return validActor(value) ? copyActor(value) : null;
    } catch {
      return null;
    }
  }

  async put(value: unknown): Promise<CacheWrite> {
    const before = await this.actor();
    if (!before) return { status: "UNVERIFIED" };
    const json = safeJson(value);
    if (json === null) return { status: "INVALID_VALUE" };
    let time: number;
    try {
      time = this.now();
    } catch {
      return { status: "INVALID_VALUE" };
    }
    if (
      !Number.isSafeInteger(time) ||
      time < 0 ||
      !Number.isSafeInteger(time + this.ttlMs)
    )
      return { status: "INVALID_VALUE" };
    const check = await this.actor();
    if (!check || !sameActor(before, check)) return { status: "STALE_ACTOR" };
    const envelope: CacheEnvelope = {
      version: 1,
      actor: before,
      createdAt: time,
      expiresAt: time + this.ttlMs,
      value: JSON.parse(json),
    };
    try {
      await this.storage.write(this.storageKey, JSON.stringify(envelope));
    } catch {
      return { status: "STORAGE_ERROR" };
    }
    // A concurrent sign-out may happen during the async write. The envelope
    // remains tagged with the OLD epoch and cannot be read by a new actor.
    const after = await this.actor();
    return after && sameActor(before, after)
      ? { status: "STORED" }
      : { status: "STALE_ACTOR" };
  }

  async get<T>(): Promise<CacheRead<T>> {
    const before = await this.actor();
    if (!before) return { status: "UNVERIFIED" };
    let raw: unknown;
    try {
      raw = await this.storage.read(this.storageKey);
    } catch {
      return { status: "STORAGE_ERROR" };
    }
    const after = await this.actor();
    if (!after || !sameActor(before, after)) return { status: "STALE_ACTOR" };
    if (raw === null || raw === undefined) return { status: "NOT_FOUND" };
    if (typeof raw !== "string" || raw.length > MAX_JSON_LENGTH + 2048)
      return { status: "INVALID_CACHE" };
    let envelope: CacheEnvelope;
    try {
      envelope = JSON.parse(raw) as CacheEnvelope;
    } catch {
      return { status: "INVALID_CACHE" };
    }
    if (
      !envelope ||
      envelope.version !== 1 ||
      !validActor(envelope.actor) ||
      !Number.isSafeInteger(envelope.createdAt) ||
      !Number.isSafeInteger(envelope.expiresAt) ||
      envelope.createdAt < 0 ||
      envelope.expiresAt <= envelope.createdAt ||
      envelope.expiresAt - envelope.createdAt > this.ttlMs
    )
      return { status: "INVALID_CACHE" };
    if (!sameActor(before, envelope.actor)) return { status: "STALE_ACTOR" };
    let time: number;
    try {
      time = this.now();
    } catch {
      return { status: "INVALID_CACHE" };
    }
    if (!Number.isSafeInteger(time) || time < envelope.createdAt)
      return { status: "INVALID_CACHE" };
    if (time >= envelope.expiresAt) return { status: "EXPIRED" };
    const safe = safeJson(envelope.value);
    if (safe === null) return { status: "INVALID_CACHE" };
    return { status: "READY", value: JSON.parse(safe) as T };
  }

  /** Explicit best-effort purge on logout/account change; never grants access. */
  async purge(): Promise<"PURGED" | "STORAGE_ERROR"> {
    try {
      await this.storage.remove(this.storageKey);
      return "PURGED";
    } catch {
      return "STORAGE_ERROR";
    }
  }
}
