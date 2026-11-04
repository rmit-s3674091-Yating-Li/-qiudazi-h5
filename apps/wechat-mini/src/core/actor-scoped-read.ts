import { AuthAccountGeneration } from "../shared-domain/AuthAccountGeneration.ts";
import type { ActorScope, SessionPort } from "./ports.ts";

export type ActorScopedReadResult<T> =
  | Readonly<{ status: "READY"; value: T }>
  | Readonly<{ status: "UNVERIFIED" | "STALE_ACTOR" | "READ_FAILED" }>;

/**
 * Snapshot a runtime SessionPort result without reading inherited properties or
 * executing getters. A validated value is never read a second time: session
 * adapters are an asynchronous trust boundary even in an offline harness.
 */
function snapshotActor(value: unknown): ActorScope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const fields = ["authUserId", "profileId", "epoch"] as const;
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== fields.length ||
      keys.some((key) => !fields.includes(key as (typeof fields)[number]))
    )
      return null;
    const actor = {} as { -readonly [K in keyof ActorScope]: ActorScope[K] };
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
        return null;
      const text = descriptor.value;
      if (
        typeof text !== "string" ||
        text.length === 0 ||
        text.length > 256 ||
        text.trim() !== text
      )
        return null;
      actor[field] = text;
    }
    return Object.freeze(actor);
  } catch {
    return null;
  }
}

/**
 * Gate 0 read-only async-result isolation. The caller must update `generation`
 * on EVERY sign-in/sign-out/account switch; a refresh for the same Auth UUID
 * does not change the generation. Never use this to authorize a write.
 *
 * `session` MUST be a trusted, server-verified SessionPort at G2. This helper
 * does not issue, verify or refresh a Supabase session and cannot elevate
 * UnprovenSessionPort to an authenticated session.
 */
export async function runActorScopedRead<T>(
  session: SessionPort,
  generation: AuthAccountGeneration,
  read: (actor: ActorScope) => Promise<T>,
): Promise<ActorScopedReadResult<T>> {
  let before: ActorScope | null;
  try {
    before = await session.getVerifiedActor();
  } catch {
    return { status: "UNVERIFIED" };
  }
  const actor = snapshotActor(before);
  if (!actor) return { status: "UNVERIFIED" };
  const capturedGeneration = generation.version;
  const isCurrent = () =>
    generation.isCurrent(actor.authUserId, capturedGeneration);
  if (!isCurrent()) return { status: "STALE_ACTOR" };

  let value: T;
  try {
    value = await read(actor);
  } catch {
    return { status: isCurrent() ? "READ_FAILED" : "STALE_ACTOR" };
  }
  if (!isCurrent()) return { status: "STALE_ACTOR" };

  let after: ActorScope | null;
  try {
    after = await session.getVerifiedActor();
  } catch {
    return { status: "UNVERIFIED" };
  }
  // The second session check can itself be asynchronous: recheck generation.
  if (!isCurrent()) return { status: "STALE_ACTOR" };
  const afterSnapshot = snapshotActor(after);
  if (
    !afterSnapshot ||
    afterSnapshot.authUserId !== actor.authUserId ||
    afterSnapshot.profileId !== actor.profileId ||
    afterSnapshot.epoch !== actor.epoch
  ) {
    return { status: "STALE_ACTOR" };
  }
  return { status: "READY", value };
}
