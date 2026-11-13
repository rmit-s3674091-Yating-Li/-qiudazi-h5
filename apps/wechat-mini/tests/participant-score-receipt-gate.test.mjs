import test from "node:test";
import assert from "node:assert/strict";
import { AuthAccountGeneration } from "../src/shared-domain/AuthAccountGeneration.ts";
import { UnprovenSessionPort } from "../src/core/ports.ts";
import { OfflineParticipantScoreReceiptGate } from "../src/core/participant-score-receipt-gate.ts";

const a = Object.freeze({
  authUserId: "auth-A",
  profileId: "profile-A",
  epoch: "epoch-1",
});
const b = Object.freeze({
  authUserId: "auth-B",
  profileId: "profile-B",
  epoch: "epoch-2",
});
const request = Object.freeze({
  eventId: "event-123",
  matchId: "match-456",
  operationId: "operation-12345",
  side: "A",
  expectedEventVersion: 7,
  expectedMatchVersion: 4,
});
const input = (changes = {}) => ({ expectedActor: a, request, ...changes });
function receipt(changes = {}) {
  return {
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
    ...changes,
  };
}
const ok = async () => ({ status: 200, data: receipt() });
function harness(actor = a) {
  const generation = new AuthAccountGeneration();
  generation.observe(actor.authUserId);
  let current = actor;
  const session = {
    getVerifiedActor: async () => current,
    refresh: async () => {},
    signOut: async () => {},
  };
  return {
    gate: new OfflineParticipantScoreReceiptGate(session, generation),
    generation,
    session,
    setActor: (next) => {
      current = next;
    },
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("unproven session never dispatches a protected score mutation", async () => {
  const generation = new AuthAccountGeneration();
  generation.observe(a.authUserId);
  const gate = new OfflineParticipantScoreReceiptGate(
    new UnprovenSessionPort(),
    generation,
  );
  let calls = 0;
  assert.equal(
    await gate.submit(input(), async () => {
      calls++;
      return ok();
    }),
    "UNVERIFIED",
  );
  assert.equal(calls, 0);
});

test("exact canonical H5 receipt and verified actor produce mock-only receipt verdict", async () => {
  const { gate } = harness();
  let captured;
  assert.equal(
    await gate.submit(input(), async (sent) => {
      captured = sent;
      return ok();
    }),
    "MOCK_RECEIPT_MATCHED",
  );
  assert.deepEqual(captured, request);
  assert.equal(Object.isFrozen(captured), true);
});

test("HTTP 200 with null or malformed receipt never proves scoring", async () => {
  const { gate } = harness();
  assert.equal(
    await gate.submit(input(), async () => ({ status: 200, data: null })),
    "RECEIPT_UNPROVEN",
  );
});

test("HTTP 200 with missing operation ID is not a receipt", async () => {
  const { gate } = harness();
  assert.equal(
    await gate.submit(input(), async () => ({
      status: 200,
      data: receipt({ point_logs: [] }),
    })),
    "RECEIPT_UNPROVEN",
  );
});

test("voided, wrong-side and duplicate operation receipts fail closed", async () => {
  for (const point_logs of [
    [
      {
        id: request.operationId,
        match_id: request.matchId,
        winner_side: "A",
        voided_at: "2026-10-26",
      },
    ],
    [
      {
        id: request.operationId,
        match_id: request.matchId,
        winner_side: "B",
        voided_at: null,
      },
    ],
    [
      {
        id: request.operationId,
        match_id: request.matchId,
        winner_side: "A",
        voided_at: null,
      },
      {
        id: request.operationId,
        match_id: request.matchId,
        winner_side: "A",
        voided_at: null,
      },
    ],
  ]) {
    const { gate } = harness();
    assert.equal(
      await gate.submit(input(), async () => ({
        status: 200,
        data: receipt({ point_logs }),
      })),
      "RECEIPT_UNPROVEN",
    );
  }
});

test("stale event or match version fails receipt verification", async () => {
  for (const changed of [
    { event: { id: request.eventId, version: 7 } },
    {
      matches: [{ id: request.matchId, event_id: request.eventId, version: 4 }],
    },
  ]) {
    const { gate } = harness();
    assert.equal(
      await gate.submit(input(), async () => ({
        status: 200,
        data: receipt(changed),
      })),
      "RECEIPT_UNPROVEN",
    );
  }
});

test("non-200 response is outcome unknown, not a proven failure or success", async () => {
  const { gate } = harness();
  assert.equal(
    await gate.submit(input(), async () => ({ status: 409, data: receipt() })),
    "OUTCOME_UNKNOWN",
  );
});

test("transport exception burns operation ID; no automatic retry", async () => {
  const { gate } = harness();
  let calls = 0;
  assert.equal(
    await gate.submit(input(), async () => {
      calls++;
      throw new Error("private token must not escape");
    }),
    "OUTCOME_UNKNOWN",
  );
  assert.equal(
    await gate.submit(input(), async () => {
      calls++;
      return ok();
    }),
    "REPLAY_REJECTED",
  );
  assert.equal(calls, 1);
});

test("two rapid taps with same operation ID dispatch only once", async () => {
  const { gate } = harness();
  const waiting = deferred();
  let calls = 0;
  const first = gate.submit(input(), async () => {
    calls++;
    return waiting.promise;
  });
  const second = await gate.submit(input(), async () => {
    calls++;
    return ok();
  });
  assert.equal(second, "REPLAY_REJECTED");
  waiting.resolve(await ok());
  assert.equal(await first, "MOCK_RECEIPT_MATCHED");
  assert.equal(calls, 1);
});

test("A to B switch during mock transport drops old receipt", async () => {
  const { gate, generation, setActor } = harness();
  const waiting = deferred();
  const result = gate.submit(input(), async () => waiting.promise);
  // Let the first session read and dispatch finish its microtask.
  await Promise.resolve();
  await Promise.resolve();
  setActor(b);
  generation.observe(b.authUserId);
  waiting.resolve(await ok());
  assert.equal(await result, "STALE_ACTOR");
});

test("A to B to A with a new generation cannot accept stale receipt", async () => {
  const { gate, generation, setActor } = harness();
  const waiting = deferred();
  const result = gate.submit(input(), async () => waiting.promise);
  await Promise.resolve();
  await Promise.resolve();
  setActor(b);
  generation.observe(b.authUserId);
  setActor(a);
  generation.observe(a.authUserId);
  waiting.resolve(await ok());
  assert.equal(await result, "STALE_ACTOR");
});

test("same auth with changed profile or epoch cannot accept receipt", async () => {
  for (const changed of [
    { ...a, profileId: "profile-B" },
    { ...a, epoch: "epoch-2" },
  ]) {
    const { gate, setActor } = harness();
    const waiting = deferred();
    const result = gate.submit(input(), async () => waiting.promise);
    await Promise.resolve();
    await Promise.resolve();
    setActor(changed);
    waiting.resolve(await ok());
    assert.equal(await result, "STALE_ACTOR");
  }
});

test("actor mismatch before dispatch never invokes mock transport", async () => {
  const { gate, generation, setActor } = harness();
  setActor(b);
  generation.observe(b.authUserId);
  let calls = 0;
  assert.equal(
    await gate.submit(input(), async () => {
      calls++;
      return ok();
    }),
    "STALE_ACTOR",
  );
  assert.equal(calls, 0);
});

test("malformed request, invalid versions and throwing proxy fail closed", async () => {
  const { gate } = harness();
  let calls = 0;
  const send = async () => {
    calls++;
    return ok();
  };
  for (const invalid of [
    null,
    { ...input(), request: { ...request, side: "C" } },
    {
      ...input(),
      request: { ...request, expectedEventVersion: Number.MAX_SAFE_INTEGER },
    },
    { ...input(), request: { ...request, expectedMatchVersion: -1 } },
    new Proxy(
      {},
      {
        get() {
          throw new Error("proxy");
        },
      },
    ),
  ]) {
    assert.equal(await gate.submit(invalid, send), "INVALID_INPUT");
  }
  assert.equal(calls, 0);
});

test("malformed receipt proxy never escapes the guard", async () => {
  const { gate } = harness();
  const malicious = new Proxy(
    {},
    {
      get() {
        throw new Error("malicious body");
      },
    },
  );
  assert.equal(
    await gate.submit(input(), async () => ({ status: 200, data: malicious })),
    "RECEIPT_UNPROVEN",
  );
});

test("session lookup error before dispatch never sends", async () => {
  const generation = new AuthAccountGeneration();
  generation.observe(a.authUserId);
  const session = {
    getVerifiedActor: async () => {
      throw new Error("private error");
    },
  };
  const gate = new OfflineParticipantScoreReceiptGate(session, generation);
  let calls = 0;
  assert.equal(
    await gate.submit(input(), async () => {
      calls++;
      return ok();
    }),
    "UNVERIFIED",
  );
  assert.equal(calls, 0);
});

test("dispatched mock ID is one-shot but another operation ID may proceed", async () => {
  const { gate } = harness();
  assert.equal(await gate.submit(input(), ok), "MOCK_RECEIPT_MATCHED");
  assert.equal(await gate.submit(input(), ok), "REPLAY_REJECTED");
  const next = input({
    request: { ...request, operationId: "operation-67890" },
  });
  assert.equal(
    await gate.submit(next, async () => ({
      status: 200,
      data: receipt({
        point_logs: [
          {
            id: "operation-67890",
            match_id: request.matchId,
            winner_side: "A",
            voided_at: null,
          },
        ],
      }),
    })),
    "MOCK_RECEIPT_MATCHED",
  );
});

test("bounded in-memory replay guard fails closed instead of evicting IDs", async () => {
  const { gate } = harness();
  for (let n = 0; n < 256; n++) {
    const unique = input({
      request: {
        ...request,
        operationId: `operation-${String(n).padStart(8, "0")}`,
      },
    });
    assert.equal(
      await gate.submit(unique, async () => ({ status: 500, data: null })),
      "OUTCOME_UNKNOWN",
    );
  }
  assert.equal(await gate.submit(input(), ok), "REPLAY_GUARD_EXHAUSTED");
});

test("account switches during first async session read never dispatch", async () => {
  const generation = new AuthAccountGeneration();
  generation.observe(a.authUserId);
  const waiting = deferred();
  const session = { getVerifiedActor: () => waiting.promise };
  const gate = new OfflineParticipantScoreReceiptGate(session, generation);
  let calls = 0;
  const result = gate.submit(input(), async () => {
    calls++;
    return ok();
  });
  generation.observe(b.authUserId);
  waiting.resolve(a);
  assert.equal(await result, "STALE_ACTOR");
  assert.equal(calls, 0);
});

test("same-actor JWT refresh leaves generation unchanged and mock receipt valid", async () => {
  const { gate, generation } = harness();
  const original = generation.version;
  assert.equal(generation.observe(a.authUserId).changed, false);
  assert.equal(generation.version, original);
  assert.equal(await gate.submit(input(), ok), "MOCK_RECEIPT_MATCHED");
});

test("lost session after dispatch returns outcome unknown without leaking receipt", async () => {
  const generation = new AuthAccountGeneration();
  generation.observe(a.authUserId);
  let count = 0;
  const session = {
    getVerifiedActor: async () => {
      count++;
      if (count === 2) throw new Error("secret");
      return a;
    },
  };
  const gate = new OfflineParticipantScoreReceiptGate(session, generation);
  assert.equal(await gate.submit(input(), ok), "OUTCOME_UNKNOWN");
  assert.equal(await gate.submit(input(), ok), "REPLAY_REJECTED");
});
