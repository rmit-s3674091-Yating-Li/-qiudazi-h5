import { encodeMiniPath, type NavigationIntent } from './navigation.ts'

/** Only an in-memory navigation intent. Never grants access or accepts an invite. */
type Pending = {
  intent: NavigationIntent
  requestId: string
  capturedAt: number
  openedByAuthId: string | null
  boundActor: { authUserId: string; generation: number } | null
}
export type PendingStatus =
  | 'READY'
  | 'REPLACEMENT_CONFIRM_REQUIRED'
  | 'INVALID_INTENT'
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'STALE_ACTOR'
  | 'CONFIRM_REQUIRED'
  | 'NAVIGATE_ONLY'
export type ActorSnapshot = Readonly<{ authUserId: string; generation: number }>
export type ActorIsCurrent = (authUserId: string, generation: number) => boolean

const requestIdPattern = /^[A-Za-z0-9_-]{8,128}$/
const actorPattern = /^[A-Za-z0-9_-]{3,128}$/
const needsConfirmation = (intent: NavigationIntent) =>
  intent.kind === 'connection_invite' || intent.kind === 'player_claim' || intent.kind === 'event_invite'

/**
 * The login return path is not an authorization channel. It retains one intent
 * in memory for at most ten minutes and rejects stale actor generations.
 * Navigation still requires server-side authorization; no mutation is issued.
 */
export class PendingIntentGate {
  private pending: Pending | null = null
  private readonly now: () => number
  private readonly ttlMs: number
  constructor(now: () => number = Date.now, ttlMs = 600_000) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new Error('INVALID_TTL')
    this.now = now
    this.ttlMs = ttlMs
  }

  clear(): void { this.pending = null }
  private getValid(): Pending | null {
    const p = this.pending
    if (!p) return null
    if (this.now() < p.capturedAt || this.now() - p.capturedAt >= this.ttlMs) {
      this.clear()
      return null
    }
    return p
  }

  capture(intent: NavigationIntent, requestId: string, openedByAuthId: string | null = null): PendingStatus {
    if (!requestIdPattern.test(requestId) ||
        (openedByAuthId !== null && !actorPattern.test(openedByAuthId))) return 'INVALID_INTENT'
    try { encodeMiniPath(intent) } catch { return 'INVALID_INTENT' }
    if (this.getValid()) return 'REPLACEMENT_CONFIRM_REQUIRED'
    this.pending = { intent: Object.freeze({ ...intent }), requestId, capturedAt: this.now(), openedByAuthId, boundActor: null }
    return 'READY'
  }

  /** Called only after the trusted session layer has checked current JWT actor. */
  bindAfterVerifiedLogin(requestId: string, actor: ActorSnapshot, isCurrent: ActorIsCurrent): PendingStatus {
    const p = this.getValid()
    if (!p) return 'NOT_FOUND'
    if (p.requestId !== requestId || !actorPattern.test(actor.authUserId) ||
        !Number.isSafeInteger(actor.generation) || actor.generation < 0 ||
        !isCurrent(actor.authUserId, actor.generation) ||
        (p.openedByAuthId !== null && p.openedByAuthId !== actor.authUserId) ||
        (p.boundActor !== null &&
          (p.boundActor.authUserId !== actor.authUserId || p.boundActor.generation !== actor.generation))) {
      this.clear()
      return 'STALE_ACTOR'
    }
    p.boundActor = { ...actor }
    return 'READY'
  }

  consumeNavigation(actor: ActorSnapshot, isCurrent: ActorIsCurrent, userConfirmed = false):
    | { status: Exclude<PendingStatus, 'NAVIGATE_ONLY'> }
    | { status: 'NAVIGATE_ONLY'; intent: NavigationIntent } {
    const p = this.getValid()
    if (!p) return { status: 'NOT_FOUND' }
    if (!p.boundActor || p.boundActor.authUserId !== actor.authUserId ||
        p.boundActor.generation !== actor.generation || !isCurrent(actor.authUserId, actor.generation)) {
      this.clear()
      return { status: 'STALE_ACTOR' }
    }
    if (needsConfirmation(p.intent) && !userConfirmed) return { status: 'CONFIRM_REQUIRED' }
    const intent = p.intent
    this.clear()
    return { status: 'NAVIGATE_ONLY', intent }
  }
}
