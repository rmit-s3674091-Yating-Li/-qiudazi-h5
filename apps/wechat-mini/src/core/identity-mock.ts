/** Offline protocol mock only. Never signs JWTs or creates Supabase sessions. */
export type MockWechatSubject = Readonly<{
  appId: string;
  openId: string;
  unionId: string | null;
}>;
export type VerifiedLegacy = Readonly<{
  authUserId: string;
  profileId: string;
}>;
export type ExchangeResult = Readonly<{
  status: "UNBOUND_IDENTITY" | "SESSION_BRIDGE_UNPROVEN" | "CONFLICT_LOCKED";
}>;
export type ExchangeInput = Readonly<{
  loginCode: string;
  requestId: string;
  clientNonce: string;
}>;

/** Fixture is installed by the mock server, NOT accepted from an unauthenticated client. */
export type LegacyBindingProofFixture = Readonly<{
  legacy: VerifiedLegacy;
  requestId: string;
  subject: MockWechatSubject;
  expiresAt: number;
  consentRecorded: boolean;
}>;

type StoredProof = Readonly<{
  legacy: VerifiedLegacy;
  requestId: string;
  subjectKey: string;
  expiresAt: number;
  consentRecorded: boolean;
}>;
type StoredRequest = {
  fingerprint: string;
  result: ExchangeResult;
  createdAt: number;
  expiresAt: number;
};
type PendingBinding = {
  subject: MockWechatSubject;
  createdAt: number;
  expiresAt: number;
};

const keyFor = (s: MockWechatSubject) =>
  JSON.stringify(["wechat_mini", s.appId, s.openId]);
const validOpaque = (s: unknown) =>
  typeof s === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(s);

/** Take one immutable, own-data-only snapshot of a mock protocol boundary. */
function ownData(
  input: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(descriptors);
    if (
      !required.every((key) => Object.hasOwn(descriptors, key)) ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (!required.includes(key) && !optional.includes(key)),
      )
    )
      return null;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function snapshotSubject(input: unknown): MockWechatSubject | null {
  const value = ownData(input, ["appId", "openId"], ["unionId"]);
  if (!value) return null;
  const { appId, openId, unionId = null } = value;
  if (
    ![appId, openId].every(
      (field) =>
        typeof field === "string" &&
        field.length > 0 &&
        field.length <= 256 &&
        field.trim() === field,
    ) ||
    (unionId !== null &&
      (typeof unionId !== "string" ||
        unionId.length === 0 ||
        unionId.length > 256 ||
        unionId.trim() !== unionId))
  )
    return null;
  return Object.freeze({
    appId: appId as string,
    openId: openId as string,
    unionId: unionId as string | null,
  });
}

function snapshotLegacy(input: unknown): VerifiedLegacy | null {
  const value = ownData(input, ["authUserId", "profileId"]);
  if (
    !value ||
    ![value.authUserId, value.profileId].every(
      (field) =>
        typeof field === "string" &&
        field.length > 0 &&
        field.length <= 256 &&
        field.trim() === field,
    )
  )
    return null;
  return Object.freeze({
    authUserId: value.authUserId as string,
    profileId: value.profileId as string,
  });
}

export class MockWechatCodeVerifier {
  private codes = new Map<string, MockWechatSubject>();
  private consumed = new Set<string>();
  register(code: string, subject: MockWechatSubject): void {
    const snapshot = snapshotSubject(subject);
    if (
      !validOpaque(code) ||
      !snapshot ||
      this.consumed.has(code) ||
      this.codes.has(code)
    )
      throw new Error("INVALID_MOCK_CODE");
    this.codes.set(code, snapshot);
  }
  verifyOnce(code: string): MockWechatSubject | null {
    if (this.consumed.has(code)) return null;
    this.consumed.add(code);
    const subject = this.codes.get(code) ?? null;
    this.codes.delete(code);
    return subject;
  }
}

/** A proof is scoped to ONE verified WeChat request and ONE external subject. */
export class MockLegacyProofVerifier {
  private proofs = new Map<string, StoredProof>();
  private consumed = new Set<string>();
  register(proof: string, fixture: LegacyBindingProofFixture): void {
    const fields = ownData(fixture, [
      "legacy",
      "requestId",
      "subject",
      "expiresAt",
      "consentRecorded",
    ]);
    const subject = fields && snapshotSubject(fields.subject);
    const legacy = fields && snapshotLegacy(fields.legacy);
    if (
      !validOpaque(proof) ||
      this.proofs.has(proof) ||
      this.consumed.has(proof) ||
      !fields ||
      !subject ||
      !legacy ||
      !validOpaque(fields.requestId) ||
      !Number.isSafeInteger(fields.expiresAt) ||
      (fields.expiresAt as number) < 1 ||
      typeof fields.consentRecorded !== "boolean"
    )
      throw new Error("INVALID_PROOF_FIXTURE");
    this.proofs.set(proof, {
      legacy,
      requestId: fields.requestId as string,
      subjectKey: keyFor(subject),
      expiresAt: fields.expiresAt as number,
      consentRecorded: fields.consentRecorded as boolean,
    });
  }
  consume(
    proof: string,
    requestId: string,
    subject: MockWechatSubject,
    now: number,
  ): VerifiedLegacy | null {
    const stored = this.proofs.get(proof);
    // Even a wrong-audience attempt burns this one-use fixture.
    this.proofs.delete(proof);
    if (stored) this.consumed.add(proof);
    const subjectSnapshot = snapshotSubject(subject);
    if (
      !stored ||
      !Number.isSafeInteger(now) ||
      now < 0 ||
      !validOpaque(requestId) ||
      !subjectSnapshot ||
      stored.requestId !== requestId ||
      stored.subjectKey !== keyFor(subjectSnapshot) ||
      !stored.consentRecorded ||
      now >= stored.expiresAt
    )
      return null;
    return { ...stored.legacy };
  }
}

export class MockIdentityServer {
  private requests = new Map<string, StoredRequest>();
  private bindings = new Map<string, VerifiedLegacy>();
  private pending = new Map<string, PendingBinding>();
  // In-memory replay tombstones: this mock must never recycle a failed request ID.
  private readonly terminalRequests = new Set<string>();
  private readonly wechat: MockWechatCodeVerifier;
  private readonly legacy: MockLegacyProofVerifier;
  private readonly now: () => number;
  private readonly ttlMs: number;
  constructor(
    wechat: MockWechatCodeVerifier,
    legacy: MockLegacyProofVerifier,
    now: () => number = Date.now,
    ttlMs = 600_000,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1)
      throw new Error("INVALID_TTL");
    this.wechat = wechat;
    this.legacy = legacy;
    this.now = now;
    this.ttlMs = ttlMs;
  }

  exchange(input: ExchangeInput): ExchangeResult {
    // The transport boundary may pass malformed JSON despite static TS types.
    const fields = ownData(input, ["loginCode", "requestId", "clientNonce"]);
    if (
      !fields ||
      ![fields.loginCode, fields.requestId, fields.clientNonce].every(
        validOpaque,
      )
    )
      return { status: "CONFLICT_LOCKED" };
    const loginCode = fields.loginCode as string;
    const requestId = fields.requestId as string;
    const clientNonce = fields.clientNonce as string;
    if (this.terminalRequests.has(requestId))
      return { status: "CONFLICT_LOCKED" };
    let now: number;
    try {
      now = this.now();
    } catch {
      return this.lockPendingBinding(requestId);
    }
    if (
      !Number.isSafeInteger(now) ||
      now < 0 ||
      !Number.isSafeInteger(now + this.ttlMs)
    ) {
      return this.lockPendingBinding(requestId);
    }
    // This is an offline fixture fingerprint. Production must not retain raw wx.login codes.
    const fingerprint = JSON.stringify([loginCode, clientNonce]);
    const old = this.requests.get(requestId);
    if (old) {
      if (now < old.createdAt || now >= old.expiresAt)
        return this.lockPendingBinding(requestId);
      return old.fingerprint === fingerprint
        ? old.result
        : this.lockPendingBinding(requestId);
    }
    const subject = snapshotSubject(this.wechat.verifyOnce(loginCode));
    if (!subject) return this.lockPendingBinding(requestId);
    const result: ExchangeResult = this.bindings.has(keyFor(subject))
      ? { status: "SESSION_BRIDGE_UNPROVEN" }
      : { status: "UNBOUND_IDENTITY" };
    const expiresAt = now + this.ttlMs;
    this.requests.set(requestId, {
      fingerprint,
      result,
      createdAt: now,
      expiresAt,
    });
    if (result.status === "UNBOUND_IDENTITY")
      this.pending.set(requestId, { subject, createdAt: now, expiresAt });
    return result;
  }

  /**
   * Terminally lock a failed exchange or pending mock binding.
   * Tombstones last for this mock instance, not a production durable replay store.
   */
  private lockPendingBinding(requestId: string): ExchangeResult {
    this.terminalRequests.add(requestId);
    this.pending.delete(requestId);
    const request = this.requests.get(requestId);
    if (request) request.result = { status: "CONFLICT_LOCKED" };
    return { status: "CONFLICT_LOCKED" };
  }

  /** A client confirmation flag is necessary but NOT sufficient: the server fixture also records consent. */
  confirmLegacyBinding(
    requestId: string,
    proof: string,
    userConfirmed: boolean,
  ): ExchangeResult {
    const pending = this.pending.get(requestId);
    // A completed/unknown request cannot mutate the prior successful result.
    if (!pending) return { status: "CONFLICT_LOCKED" };
    let now: number;
    try {
      now = this.now();
    } catch {
      return this.lockPendingBinding(requestId);
    }
    if (
      !Number.isSafeInteger(now) ||
      now < pending.createdAt ||
      now >= pending.expiresAt
    )
      return this.lockPendingBinding(requestId);
    // Declining a binding is terminal for this login attempt.
    if (userConfirmed !== true) return this.lockPendingBinding(requestId);
    const verified = this.legacy.consume(
      proof,
      requestId,
      pending.subject,
      now,
    );
    if (!verified) return this.lockPendingBinding(requestId);
    const key = keyFor(pending.subject);
    const existing = this.bindings.get(key);
    if (
      existing &&
      (existing.authUserId !== verified.authUserId ||
        existing.profileId !== verified.profileId)
    ) {
      return this.lockPendingBinding(requestId);
    }
    // Fail closed if another WeChat subject already owns either legacy identifier.
    // A second AppID or OpenID needs an independently reviewed multi-link flow;
    // matching nicknames/UnionID are never sufficient for implicit linking.
    for (const [otherSubjectKey, bound] of this.bindings) {
      if (
        otherSubjectKey !== key &&
        (bound.profileId === verified.profileId ||
          bound.authUserId === verified.authUserId)
      ) {
        return this.lockPendingBinding(requestId);
      }
    }
    this.bindings.set(key, Object.freeze({ ...verified }));
    this.pending.delete(requestId);
    const request = this.requests.get(requestId);
    if (request) request.result = { status: "SESSION_BRIDGE_UNPROVEN" };
    return { status: "SESSION_BRIDGE_UNPROVEN" };
  }
  /** Read-only test inspection. Never exposes an Admin role, access token or refresh token. */
  inspectBinding(subject: MockWechatSubject): VerifiedLegacy | null {
    const snapshot = snapshotSubject(subject);
    if (!snapshot) return null;
    const binding = this.bindings.get(keyFor(snapshot));
    return binding ? { ...binding } : null;
  }
}
