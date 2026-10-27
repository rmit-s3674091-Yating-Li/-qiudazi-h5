import { AuthAccountGeneration } from "../shared-domain/AuthAccountGeneration.ts";
import type { ActorScope, SessionPort } from "./ports.ts";

export type ActorScopedReadResult<T> =
  | Readonly<{ status: "READY"; value: T }>
  | Readonly<{ status: "UNVERIFIED" | "STALE_ACTOR" | "READ_FAILED" }>;

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
  if (!validActor(before)) return { status: "UNVERIFIED" };
  const actor = Object.freeze({
    authUserId: before.authUserId,
    profileId: before.profileId,
    epoch: before.epoch,
  });
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
  if (
    !validActor(after) ||
    after.authUserId !== actor.authUserId ||
    after.profileId !== actor.profileId ||
    after.epoch !== actor.epoch
  ) {
    return { status: "STALE_ACTOR" };
  }
  return { status: "READY", value };
}
