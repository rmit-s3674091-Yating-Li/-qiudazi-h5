import test from "node:test";
import assert from "node:assert/strict";
import { AuthAccountGeneration } from "../src/shared-domain/AuthAccountGeneration.ts";
import { OfflineParticipantScoreReceiptGate } from "../src/core/participant-score-receipt-gate.ts";

const actor = Object.freeze({
  authUserId: "auth-A",
  profileId: "profile-A",
  epoch: "epoch-1",
});
const request = Object.freeze({
  eventId: "event-123",
  matchId: "match-456",
  operationId: "operation-12345",
  side: "A",
  expectedEventVersion: 7,
  expectedMatchVersion: 4,
});
const submission = (a = actor, r = request) => ({
  expectedActor: a,
  request: r,
});
const receipt = () => ({
  viewer_role: "participant",
  event: { id: request.eventId, version: 8 },
  entries: [],
  matches: [{ id: request.matchId, event_id: request.eventId, version: 5 }],
  set_scores: [],
  point_logs: [
    {
      id: request.operationId,
      match_id: request.matchId,
      winner_side: "A",
      voided_at: null,
    },
  ],
  photo: null,
});
const response = async () => ({ status: 200, data: receipt() });
function harness(getActor = async () => actor) {
  const generation = new AuthAccountGeneration();
  generation.observe(actor.authUserId);
  const session = {
    getVerifiedActor: getActor,
    refresh: async () => {},
    signOut: async () => {},
  };
  return new OfflineParticipantScoreReceiptGate(session, generation);
}
async function rejectedBeforeDispatch(
  input,
  expected = "INVALID_INPUT",
  getActor,
) {
  const gate = harness(getActor);
  let calls = 0;
  const result = await gate.submit(input, async () => {
    calls++;
    return response();
  });
  assert.equal(result, expected);
  assert.equal(calls, 0, "invalid actor/request must never dispatch a score");
}

test("ordinary own-data request and actor still produce mock-only receipt", async () => {
  assert.equal(
    await harness().submit(submission(), response),
    "MOCK_RECEIPT_MATCHED",
  );
});

test("null-prototype own-data records remain valid", async () => {
  const input = Object.assign(Object.create(null), {
    expectedActor: Object.assign(Object.create(null), actor),
    request: Object.assign(Object.create(null), request),
  });
  assert.equal(await harness().submit(input, response), "MOCK_RECEIPT_MATCHED");
});

test("top-level inherited request is not accepted", async () => {
  await rejectedBeforeDispatch(
    Object.create({ expectedActor: actor, request }),
  );
});

test("top-level accessor is not executed", async () => {
  let reads = 0;
  const input = {
    expectedActor: actor,
    get request() {
      reads++;
      return request;
    },
  };
  await rejectedBeforeDispatch(input);
  assert.equal(reads, 0);
});

test("top-level credential field is rejected rather than copied", async () => {
  await rejectedBeforeDispatch({
    ...submission(),
    refresh_token: "do-not-send",
  });
});

test("inherited actor field fails closed", async () => {
  const inherited = Object.assign(Object.create({ epoch: actor.epoch }), {
    authUserId: actor.authUserId,
    profileId: actor.profileId,
  });
  await rejectedBeforeDispatch(submission(inherited));
});

test("actor getter cannot mutate identity across validation and copy", async () => {
  let reads = 0;
  const withGetter = {
    ...actor,
    get authUserId() {
      reads++;
      return reads === 1 ? actor.authUserId : "auth-B";
    },
  };
  await rejectedBeforeDispatch(submission(withGetter));
  assert.equal(reads, 0);
});

test("extra actor role or credential is rejected", async () => {
  await rejectedBeforeDispatch(submission({ ...actor, role: "admin" }));
  await rejectedBeforeDispatch(
    submission({ ...actor, session_key: "private" }),
  );
});

test("inherited request operation ID fails closed", async () => {
  const inherited = Object.assign(
    Object.create({ operationId: request.operationId }),
    {
      eventId: request.eventId,
      matchId: request.matchId,
      side: request.side,
      expectedEventVersion: request.expectedEventVersion,
      expectedMatchVersion: request.expectedMatchVersion,
    },
  );
  await rejectedBeforeDispatch(submission(actor, inherited));
});

test("request getter is not executed", async () => {
  let reads = 0;
  const withGetter = {
    ...request,
    get operationId() {
      reads++;
      return request.operationId;
    },
  };
  await rejectedBeforeDispatch(submission(actor, withGetter));
  assert.equal(reads, 0);
});

test("extra request bearer credential is rejected", async () => {
  await rejectedBeforeDispatch(
    submission(actor, { ...request, access_token: "private" }),
  );
});

test("non-enumerable and symbol fields fail closed", async () => {
  const withHidden = { ...request };
  Object.defineProperty(withHidden, "role", {
    value: "admin",
    enumerable: false,
  });
  await rejectedBeforeDispatch(submission(actor, withHidden));
  await rejectedBeforeDispatch(
    submission(actor, { ...request, [Symbol("credential")]: "private" }),
  );
});

test("throwing Proxy reflection is caught without dispatch", async () => {
  const malicious = new Proxy(request, {
    ownKeys() {
      throw new Error("secret");
    },
  });
  await rejectedBeforeDispatch(submission(actor, malicious));
});

test("verified session actor with inherited fields cannot authorize dispatch", async () => {
  const inherited = Object.assign(Object.create({ epoch: actor.epoch }), {
    authUserId: actor.authUserId,
    profileId: actor.profileId,
  });
  await rejectedBeforeDispatch(
    submission(),
    "UNVERIFIED",
    async () => inherited,
  );
});

test("verified session actor getter is never executed before dispatch", async () => {
  let reads = 0;
  const dynamic = {
    ...actor,
    get authUserId() {
      reads++;
      return actor.authUserId;
    },
  };
  await rejectedBeforeDispatch(submission(), "UNVERIFIED", async () => dynamic);
  assert.equal(reads, 0);
});

test("session actor becomes invalid after dispatch: stale verdict, never receipt success", async () => {
  let reads = 0;
  const gate = harness(async () =>
    ++reads === 1 ? actor : { ...actor, role: "admin" },
  );
  let sends = 0;
  assert.equal(
    await gate.submit(submission(), async () => {
      sends++;
      return response();
    }),
    "STALE_ACTOR",
  );
  assert.equal(sends, 1);
});

test("mock-only verdict remains guarded against replay", async () => {
  const gate = harness();
  assert.equal(
    await gate.submit(submission(), response),
    "MOCK_RECEIPT_MATCHED",
  );
  assert.equal(await gate.submit(submission(), response), "REPLAY_REJECTED");
});
