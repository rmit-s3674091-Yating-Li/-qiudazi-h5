/** Offline protocol mock only. Never signs JWTs or creates Supabase sessions. */
export type MockWechatSubject = Readonly<{ appId: string; openId: string; unionId: string | null }>
export type VerifiedLegacy = Readonly<{ authUserId: string; profileId: string }>
export type ExchangeResult = Readonly<{ status: 'UNBOUND_IDENTITY' | 'SESSION_BRIDGE_UNPROVEN' | 'CONFLICT_LOCKED' }>
export type ExchangeInput = Readonly<{ loginCode: string; requestId: string; clientNonce: string }>

/** Fixture is installed by the mock server, NOT accepted from an unauthenticated client. */
export type LegacyBindingProofFixture = Readonly<{
  legacy: VerifiedLegacy
  requestId: string
  subject: MockWechatSubject
  expiresAt: number
  consentRecorded: boolean
}>

type StoredProof = Readonly<{
  legacy: VerifiedLegacy
  requestId: string
  subjectKey: string
  expiresAt: number
  consentRecorded: boolean
}>
type StoredRequest = {
  fingerprint: string
  result: ExchangeResult
  expiresAt: number
}
type PendingBinding = { subject: MockWechatSubject; expiresAt: number }

const keyFor = (s: MockWechatSubject) => JSON.stringify(['wechat_mini', s.appId, s.openId])
const validOpaque = (s: string) => typeof s === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(s)
const validSubject = (s: MockWechatSubject) =>
  !!s && typeof s.appId === 'string' && s.appId.length > 0 &&
  typeof s.openId === 'string' && s.openId.length > 0

export class MockWechatCodeVerifier {
  private codes = new Map<string, MockWechatSubject>()
  private consumed = new Set<string>()
  register(code: string, subject: MockWechatSubject): void {
    if (!validOpaque(code) || !validSubject(subject) || this.consumed.has(code) || this.codes.has(code)) throw new Error('INVALID_MOCK_CODE')
    this.codes.set(code, Object.freeze({ ...subject }))
  }
  verifyOnce(code: string): MockWechatSubject | null {
    if (this.consumed.has(code)) return null
    this.consumed.add(code)
    const subject = this.codes.get(code) ?? null
    this.codes.delete(code)
    return subject
  }
}

/** A proof is scoped to ONE verified WeChat request and ONE external subject. */
export class MockLegacyProofVerifier {
  private proofs = new Map<string, StoredProof>()
  private consumed = new Set<string>()
  register(proof: string, fixture: LegacyBindingProofFixture): void {
    if (!validOpaque(proof) || this.proofs.has(proof) || this.consumed.has(proof) ||
        !validOpaque(fixture.requestId) || !validSubject(fixture.subject) ||
        !fixture.legacy.authUserId || !fixture.legacy.profileId ||
        !Number.isFinite(fixture.expiresAt)) throw new Error('INVALID_PROOF_FIXTURE')
    this.proofs.set(proof, {
      legacy: Object.freeze({ ...fixture.legacy }),
      requestId: fixture.requestId,
      subjectKey: keyFor(fixture.subject),
      expiresAt: fixture.expiresAt,
      consentRecorded: fixture.consentRecorded === true,
    })
  }
  consume(proof: string, requestId: string, subject: MockWechatSubject, now: number): VerifiedLegacy | null {
    const stored = this.proofs.get(proof)
    // Even a wrong-audience attempt burns this one-use fixture.
    this.proofs.delete(proof)
    if (stored) this.consumed.add(proof)
    if (!stored || stored.requestId !== requestId || stored.subjectKey !== keyFor(subject) ||
        !stored.consentRecorded || now >= stored.expiresAt) return null
    return { ...stored.legacy }
  }
}

export class MockIdentityServer {
  private requests = new Map<string, StoredRequest>()
  private bindings = new Map<string, VerifiedLegacy>()
  private pending = new Map<string, PendingBinding>()
  private readonly wechat: MockWechatCodeVerifier
  private readonly legacy: MockLegacyProofVerifier
  private readonly now: () => number
  private readonly ttlMs: number
  constructor(wechat: MockWechatCodeVerifier, legacy: MockLegacyProofVerifier, now: () => number = Date.now, ttlMs = 600_000) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new Error('INVALID_TTL')
    this.wechat = wechat
    this.legacy = legacy
    this.now = now
    this.ttlMs = ttlMs
  }

  exchange(input: ExchangeInput): ExchangeResult {
    if (![input.loginCode, input.requestId, input.clientNonce].every(validOpaque)) return { status: 'CONFLICT_LOCKED' }
    // This is an offline fixture fingerprint. Production must not retain raw wx.login codes.
    const fingerprint = JSON.stringify([input.loginCode, input.clientNonce])
    const old = this.requests.get(input.requestId)
    if (old) {
      if (this.now() >= old.expiresAt) {
        this.requests.delete(input.requestId)
        this.pending.delete(input.requestId)
        return { status: 'CONFLICT_LOCKED' }
      }
      return old.fingerprint === fingerprint ? old.result : { status: 'CONFLICT_LOCKED' }
    }
    const subject = this.wechat.verifyOnce(input.loginCode)
    if (!subject || !validSubject(subject)) return { status: 'CONFLICT_LOCKED' }
    const result: ExchangeResult = this.bindings.has(keyFor(subject))
      ? { status: 'SESSION_BRIDGE_UNPROVEN' }
      : { status: 'UNBOUND_IDENTITY' }
    const expiresAt = this.now() + this.ttlMs
    this.requests.set(input.requestId, { fingerprint, result, expiresAt })
    if (result.status === 'UNBOUND_IDENTITY') this.pending.set(input.requestId, { subject, expiresAt })
    return result
  }

  /** A client confirmation flag is necessary but NOT sufficient: the server fixture also records consent. */
  confirmLegacyBinding(requestId: string, proof: string, userConfirmed: boolean): ExchangeResult {
    const pending = this.pending.get(requestId)
    if (!pending || this.now() >= pending.expiresAt) {
      this.pending.delete(requestId)
      return { status: 'CONFLICT_LOCKED' }
    }
    if (userConfirmed !== true) return { status: 'CONFLICT_LOCKED' }
    const verified = this.legacy.consume(proof, requestId, pending.subject, this.now())
    if (!verified) return { status: 'CONFLICT_LOCKED' }
    const key = keyFor(pending.subject)
    const existing = this.bindings.get(key)
    if (existing && (existing.authUserId !== verified.authUserId || existing.profileId !== verified.profileId)) {
      this.pending.delete(requestId)
      return { status: 'CONFLICT_LOCKED' }
    }
    // Fail closed if another WeChat subject already owns either legacy identifier.
    // A second AppID or OpenID needs an independently reviewed multi-link flow;
    // matching nicknames/UnionID are never sufficient for implicit linking.
    for (const [otherSubjectKey, bound] of this.bindings) {
      if (otherSubjectKey !== key &&
          (bound.profileId === verified.profileId || bound.authUserId === verified.authUserId)) {
        this.pending.delete(requestId)
        return { status: 'CONFLICT_LOCKED' }
      }
    }
    this.bindings.set(key, Object.freeze({ ...verified }))
    this.pending.delete(requestId)
    const request = this.requests.get(requestId)
    if (request) request.result = { status: 'SESSION_BRIDGE_UNPROVEN' }
    return { status: 'SESSION_BRIDGE_UNPROVEN' }
  }
  /** Read-only test inspection. Never exposes an Admin role, access token or refresh token. */
  inspectBinding(subject: MockWechatSubject): VerifiedLegacy | null {
    const binding = this.bindings.get(keyFor(subject))
    return binding ? { ...binding } : null
  }
}
