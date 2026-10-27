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

function validActor(value: unknown): value is ActorScope {
  if (!value || typeof value !== "object") return false;
  try {
    const actor = value as Partial<ActorScope>;
    return [actor.authUserId, actor.profileId, actor.epoch].every(
      (field) =>
        typeof field === "string" &&
        field.length > 0 &&
        field.length <= 256 &&
        field.trim() === field &&
        !/[\u0000-\u001f\u007f]/.test(field),
    );
  } catch {
    return false;
  }
}
function sameActor(a: ActorScope, b: ActorScope): boolean {
  return (
    a.authUserId === b.authUserId &&
    a.profileId === b.profileId &&
    a.epoch === b.epoch
  );
}
function parseSubmission(value: unknown): MockScoreSubmission | null {
  if (!value || typeof value !== "object") return null;
  try {
    const candidate = value as Partial<MockScoreSubmission>;
    const actor = candidate.expectedActor;
    const request = candidate.request;
    if (!validActor(actor) || !request || typeof request !== "object")
      return null;
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
      expectedEventVersion < 0 ||
      expectedEventVersion >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(expectedMatchVersion) ||
      expectedMatchVersion < 0 ||
      expectedMatchVersion >= Number.MAX_SAFE_INTEGER
    )
      return null;
    return {
      expectedActor: Object.freeze({
        authUserId: actor.authUserId,
        profileId: actor.profileId,
        epoch: actor.epoch,
      }),
      request: Object.freeze({
        eventId,
        matchId,
        operationId,
        side,
        expectedEventVersion,
        expectedMatchVersion,
      }),
    };
  } catch {
    return null;
  }
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
      if (!validActor(before)) return "UNVERIFIED";
      if (!sameActor(before, expectedActor)) return "STALE_ACTOR";

      didDispatch = true;
      this.dispatched.add(operationId);
      const response = await sendMock(request);
      if (!isCurrent()) return "STALE_ACTOR";
      const after = await this.session.getVerifiedActor();
      if (
        !isCurrent() ||
        !validActor(after) ||
        !sameActor(after, expectedActor)
      )
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
