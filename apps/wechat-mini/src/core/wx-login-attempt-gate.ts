import type { WechatExchangeRequest } from "./session-contract.ts";

/**
 * Gate 0 ONLY. An injected function is an in-process mock, not a transport or
 * a code2Session implementation. This gate never stores wx.login codes,
 * requests tokens, creates an Auth session, or treats a mock as authentication.
 * One instance represents ONE wx.login code attempt, including ambiguous loss.
 */
export type OfflineWxLoginOutcome =
  | Readonly<{ status: "MOCK_EXCHANGE_ONLY"; protocolStatus: MockWireStatus }>
  | Readonly<{
      status:
        | "INVALID_INPUT"
        | "STALE_CONTEXT"
        | "REPLAY_REJECTED"
        | "PROTOCOL_REJECTED"
        | "OUTCOME_UNKNOWN";
    }>;

type MockWireStatus =
  | "WECHAT_VERIFIED_UNBOUND"
  | "BINDING_CHALLENGE_REQUIRED"
  | "CONFLICT_LOCKED"
  | "SESSION_BRIDGE_UNPROVEN";

export type OfflineAttemptContext = Readonly<{
  generation: number;
  isCurrent: (generation: number) => boolean;
}>;

const codePattern = /^[A-Za-z0-9_-]{8,512}$/;
const idPattern = /^[A-Za-z0-9_-]{8,128}$/;
const statusActions: Readonly<Record<MockWireStatus, string>> = {
  WECHAT_VERIFIED_UNBOUND: "BIND",
  BINDING_CHALLENGE_REQUIRED: "BIND",
  CONFLICT_LOCKED: "NONE",
  SESSION_BRIDGE_UNPROVEN: "NONE",
};

/** Snapshot ONLY own, enumerable data properties. Never invoke accessors. */
function snapshot(
  raw: unknown,
  names: readonly string[],
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    const prototype = Object.getPrototypeOf(raw);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(raw);
    if (keys.length !== names.length) return null;
    const output: Record<string, unknown> = Object.create(null);
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(raw, name);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
        return null;
      output[name] = descriptor.value;
    }
    if (keys.some((key) => typeof key !== "string" || !names.includes(key)))
      return null;
    return output;
  } catch {
    return null;
  }
}

function parseRequest(raw: unknown): WechatExchangeRequest | null {
  const fields = snapshot(raw, ["login_code", "request_id", "client_nonce"]);
  if (
    !fields ||
    typeof fields.login_code !== "string" ||
    !codePattern.test(fields.login_code) ||
    typeof fields.request_id !== "string" ||
    !idPattern.test(fields.request_id) ||
    typeof fields.client_nonce !== "string" ||
    !idPattern.test(fields.client_nonce)
  )
    return null;
  return {
    login_code: fields.login_code,
    request_id: fields.request_id,
    client_nonce: fields.client_nonce,
  };
}

function parseMockStatus(raw: unknown): MockWireStatus | null {
  const fields = snapshot(raw, ["status", "correlation_id", "next_action"]);
  if (
    !fields ||
    typeof fields.status !== "string" ||
    !Object.prototype.hasOwnProperty.call(statusActions, fields.status) ||
    typeof fields.correlation_id !== "string" ||
    !idPattern.test(fields.correlation_id) ||
    fields.next_action !== statusActions[fields.status as MockWireStatus]
  )
    return null;
  return fields.status as MockWireStatus;
}

/** Fail closed on expired/rolled-back clocks, actor changes and any replay. */
export class OfflineWxLoginAttemptGate {
  private attempted = false;
  private readonly now: () => number;
  private readonly ttlMs: number;
  constructor(now: () => number = Date.now, ttlMs = 120_000) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1)
      throw new Error("INVALID_MOCK_TTL");
    this.now = now;
    this.ttlMs = ttlMs;
  }

  private safeNow(): number | null {
    try {
      const value = this.now();
      return Number.isSafeInteger(value) &&
        value >= 0 &&
        Number.isSafeInteger(value + this.ttlMs)
        ? value
        : null;
    } catch {
      return null;
    }
  }

  async attempt(
    untrusted: unknown,
    context: OfflineAttemptContext,
    exchangeMock: (request: WechatExchangeRequest) => Promise<unknown>,
  ): Promise<OfflineWxLoginOutcome> {
    if (this.attempted) return { status: "REPLAY_REJECTED" };
    const request = parseRequest(untrusted);
    const contextFields = snapshot(context, ["generation", "isCurrent"]);
    const generation = contextFields?.generation;
    const isCurrent = contextFields?.isCurrent;
    if (
      !request ||
      !Number.isSafeInteger(generation) ||
      (generation as number) < 0 ||
      typeof isCurrent !== "function" ||
      typeof exchangeMock !== "function"
    )
      return { status: "INVALID_INPUT" };
    // Consume synchronously before the first await; do not retain the code.
    this.attempted = true;
    const started = this.safeNow();
    const epoch = generation as number;
    const checkCurrent = isCurrent as (value: number) => boolean;
    const current = (): boolean => {
      try {
        return checkCurrent(epoch) === true;
      } catch {
        return false;
      }
    };
    if (started === null || !current()) return { status: "STALE_CONTEXT" };
    let response: unknown;
    try {
      response = await exchangeMock(request);
    } catch {
      // An exchange may have completed remotely. Never silently retry a code.
      return { status: "OUTCOME_UNKNOWN" };
    }
    const finished = this.safeNow();
    if (
      finished === null ||
      finished < started ||
      finished >= started + this.ttlMs ||
      !current()
    )
      return { status: "STALE_CONTEXT" };
    const protocolStatus = parseMockStatus(response);
    if (!protocolStatus) return { status: "PROTOCOL_REJECTED" };
    // In particular, a returned SESSION_VERIFIED must NEVER elevate a mock.
    return { status: "MOCK_EXCHANGE_ONLY", protocolStatus };
  }
}
