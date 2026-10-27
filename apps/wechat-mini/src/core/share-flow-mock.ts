import { AuthAccountGeneration } from "../shared-domain/AuthAccountGeneration.ts";
import {
  PendingIntentGate,
  type ActorSnapshot,
  type PendingStatus,
} from "./pending-intent.ts";
import type { NavigationIntent } from "./navigation.ts";

/** Deliberately fake actors, never Supabase Auth IDs or real WeChat identities. */
export type MockActorLabel = "A" | "B";
export type MockNavigationResult =
  | { status: "MOCK_SESSION_REQUIRED" }
  | { status: Exclude<PendingStatus, "NAVIGATE_ONLY"> }
  | { status: "NAVIGATE_ONLY"; intent: NavigationIntent };

/**
 * Offline UI harness ONLY. It never calls wx.login, a backend, an RPC or an
 * invite mutation. `NAVIGATE_ONLY` is not permission to read a private event.
 * The real session bridge remains SESSION_BRIDGE_UNPROVEN.
 */
export class OfflineShareFlow {
  private readonly gate: PendingIntentGate;
  private readonly generations = new AuthAccountGeneration();
  private requestId: string | null = null;
  private boundActor: ActorSnapshot | null = null;
  private sequence = 0;

  constructor(now: () => number = Date.now, ttlMs = 600_000) {
    this.gate = new PendingIntentGate(now, ttlMs);
  }

  private invalidate(): void {
    this.gate.clear();
    this.requestId = null;
    this.boundActor = null;
  }

  reset(): void {
    this.invalidate();
    this.generations.observe(null);
  }

  capture(intent: NavigationIntent): PendingStatus {
    // A sequential request ID is safe only because this harness has no network.
    const requestId = `mock-request-${String(++this.sequence).padStart(8, "0")}`;
    const status = this.gate.capture(intent, requestId);
    if (status === "READY") {
      this.requestId = requestId;
      this.boundActor = null;
    }
    return status;
  }

  /** Simulates a locally checked actor; must never be wired to production auth. */
  simulateLocalActor(label: MockActorLabel): PendingStatus {
    if (!this.requestId) return "NOT_FOUND";
    if (label !== "A" && label !== "B") {
      this.invalidate();
      return "STALE_ACTOR";
    }
    const authUserId = `mock-user-${label}`;
    const { generation } = this.generations.observe(authUserId);
    if (
      this.boundActor &&
      (this.boundActor.authUserId !== authUserId ||
        this.boundActor.generation !== generation)
    ) {
      this.invalidate();
      return "STALE_ACTOR";
    }
    const actor = { authUserId, generation };
    const status = this.gate.bindAfterVerifiedLogin(
      this.requestId,
      actor,
      (userId, version) => this.generations.isCurrent(userId, version),
    );
    if (status === "READY") this.boundActor = actor;
    else this.invalidate();
    return status;
  }

  /** Switching actors invalidates the pending share even after A → B → A. */
  switchLocalActor(label: MockActorLabel): PendingStatus {
    if (label !== "A" && label !== "B") {
      this.invalidate();
      return "STALE_ACTOR";
    }
    const authUserId = `mock-user-${label}`;
    const { changed } = this.generations.observe(authUserId);
    if (changed) {
      this.invalidate();
      return "STALE_ACTOR";
    }
    return this.requestId ? "READY" : "NOT_FOUND";
  }

  resumeNavigation(userConfirmed = false): MockNavigationResult {
    if (!this.boundActor) return { status: "MOCK_SESSION_REQUIRED" };
    const result = this.gate.consumeNavigation(
      this.boundActor,
      (userId, version) => this.generations.isCurrent(userId, version),
      userConfirmed === true,
    );
    if (result.status !== "CONFIRM_REQUIRED") this.invalidate();
    return result;
  }
}
