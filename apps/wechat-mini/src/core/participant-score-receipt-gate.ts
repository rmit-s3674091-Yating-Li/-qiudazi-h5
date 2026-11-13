import { AuthAccountGeneration } from "../shared-domain/AuthAccountGeneration.ts";
import { isParticipantPointReceipt } from "../shared-domain/ParticipantPointReceipt.ts";
import type { ActorScope, SessionPort } from "./ports.ts";

export type ParticipantScoreRequest = Readonly<{
  eventId: string;
  matchId: string;
  operationId: string;
  side: "A" | "B";
  expectedEventVersion: number;
  expectedMatchVersion: number;
}>;
export type MockScoreSubmission = Readonly<{
  expectedActor: ActorScope;
  request: ParticipantScoreRequest;
}>;
export type MockScoreReceiptStatus =
  | "MOCK_RECEIPT_MATCHED"
  | "RECEIPT_UNPROVEN"
  | "OUTCOME_UNKNOWN"
  | "UNVERIFIED"
  | "STALE_ACTOR"
  | "INVALID_INPUT"
  | "REPLAY_REJECTED"
  | "REPLAY_GUARD_EXHAUSTED";

const idPattern = /^[A-Za-z0-9_-]{3,128}$/;
const operationPattern = /^[A-Za-z0-9_-]{8,128}$/;
const maxDispatched = 256;

/**
 * Snapshot a fixed wire contract without invoking getters or reading inherited
 * fields. Reject unexpected keys (including symbols/non-enumerable fields),
 * malformed descriptors and reflection errors. This is an offline input gate,
 * not a proof that an arbitrary JavaScript Proxy is a trusted identity.
 */
function ownDataSnapshot(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
    )
      return null;
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
        return null;
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

const actorKeys = ["authUserId", "profileId", "epoch"] as const;
const submissionKeys = ["expectedActor", "request"] as const;
const requestKeys = [
  "eventId",
  "matchId",
  "operationId",
  "side",
  "expectedEventVersion",
  "expectedMatchVersion",
] as const;

function snapshotActor(value: unknown): ActorScope | null {
  const data = ownDataSnapshot(value, actorKeys);
  if (!data) return null;
  const { authUserId, profileId, epoch } = data;
  if (
    ![authUserId, profileId, epoch].every(
      (field) =>
        typeof field === "string" &&
        field.length > 0 &&
        field.length <= 256 &&
        field.trim() === field &&
        !/[\u0000-\u001f\u007f]/.test(field),
    )
  )
    return null;
  return Object.freeze({
    authUserId: authUserId as string,
    profileId: profileId as string,
    epoch: epoch as string,
  });
}
function sameActor(a: ActorScope, b: ActorScope): boolean {
  return (
    a.authUserId === b.authUserId &&
    a.profileId === b.profileId &&
    a.epoch === b.epoch
  );
}
function parseSubmission(value: unknown): MockScoreSubmission | null {
  const data = ownDataSnapshot(value, submissionKeys);
  if (!data) return null;
  const expectedActor = snapshotActor(data.expectedActor);
  const request = ownDataSnapshot(data.request, requestKeys);
  if (!expectedActor || !request) return null;
  const {
    eventId,
    matchId,
    operationId,
    side,
    expectedEventVersion,
    expectedMatchVersion,
  } = request;
  if (
    typeof eventId !== "string" ||
    !idPattern.test(eventId) ||
    typeof matchId !== "string" ||
    !idPattern.test(matchId) ||
    typeof operationId !== "string" ||
    !operationPattern.test(operationId) ||
    (side !== "A" && side !== "B") ||
    !Number.isSafeInteger(expectedEventVersion) ||
    (expectedEventVersion as number) < 0 ||
    (expectedEventVersion as number) >= Number.MAX_SAFE_INTEGER ||
    !Number.isSafeInteger(expectedMatchVersion) ||
    (expectedMatchVersion as number) < 0 ||
    (expectedMatchVersion as number) >= Number.MAX_SAFE_INTEGER
  )
    return null;
  return Object.freeze({
    expectedActor,
    request: Object.freeze({
      eventId,
      matchId,
      operationId,
      side,
      expectedEventVersion,
      expectedMatchVersion,
    }) as ParticipantScoreRequest,
  });
}

/**
 * Gate 1 offline-only score receipt demonstrator. `sendMock` MUST be an
 * in-process fixture, never a production RPC. It does not create a session,
 * verify a JWT, authorize participant scoring or persist an operation.
 *
 * An HTTP 200 is not proof of a committed point: the canonical H5 receipt
 * validator must find the exact non-voided operation and advanced versions.
 * Once a mock dispatch begins, its operation ID is burned even on timeout:
 * the outcome may be unknown. Production needs server-side idempotency and
 * reconciliation; this in-memory guard cannot provide either across restarts.
 */
export class OfflineParticipantScoreReceiptGate {
  private readonly inFlight = new Set<string>();
  private readonly dispatched = new Set<string>();

  private readonly session: SessionPort;
  private readonly generation: AuthAccountGeneration;

  constructor(session: SessionPort, generation: AuthAccountGeneration) {
    this.session = session;
    this.generation = generation;
  }

  async submit(
    input: unknown,
    sendMock: (request: ParticipantScoreRequest) => Promise<{
      status: number;
      data: unknown;
    }>,
  ): Promise<MockScoreReceiptStatus> {
    const parsed = parseSubmission(input);
    if (!parsed || typeof sendMock !== "function") return "INVALID_INPUT";
    const { expectedActor, request } = parsed;
    const operationId = request.operationId;
    if (this.inFlight.has(operationId) || this.dispatched.has(operationId))
      return "REPLAY_REJECTED";
    if (this.inFlight.size + this.dispatched.size >= maxDispatched)
      return "REPLAY_GUARD_EXHAUSTED";
    // Reserve synchronously, before the first await, to stop double taps.
    this.inFlight.add(operationId);
    let didDispatch = false;
    const capturedGeneration = this.generation.version;
    const isCurrent = () =>
      this.generation.isCurrent(expectedActor.authUserId, capturedGeneration);
    try {
      if (!isCurrent()) return "STALE_ACTOR";
      const before = await this.session.getVerifiedActor();
      if (!isCurrent()) return "STALE_ACTOR";
      const beforeActor = snapshotActor(before);
      if (!beforeActor) return "UNVERIFIED";
      if (!sameActor(beforeActor, expectedActor)) return "STALE_ACTOR";

      didDispatch = true;
      this.dispatched.add(operationId);
      const response = await sendMock(request);
      if (!isCurrent()) return "STALE_ACTOR";
      const after = await this.session.getVerifiedActor();
      const afterActor = snapshotActor(after);
      if (!isCurrent() || !afterActor || !sameActor(afterActor, expectedActor))
        return "STALE_ACTOR";
      try {
        if (!response || response.status !== 200) return "OUTCOME_UNKNOWN";
        return isParticipantPointReceipt(response.data, request)
          ? "MOCK_RECEIPT_MATCHED"
          : "RECEIPT_UNPROVEN";
      } catch {
        return "RECEIPT_UNPROVEN";
      }
    } catch {
      return didDispatch ? "OUTCOME_UNKNOWN" : "UNVERIFIED";
    } finally {
      this.inFlight.delete(operationId);
    }
  }
}
