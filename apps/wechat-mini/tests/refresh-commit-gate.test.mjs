import test from "node:test";
import assert from "node:assert/strict";
import { OfflineRefreshCommitGate } from "../src/core/refresh-commit-gate.ts";

const A = Object.freeze({
  authUserId: "auth-A",
  profileId: "profile-A",
  epoch: "session-A",
  generation: 1,
});
const B = Object.freeze({
  ...A,
  authUserId: "auth-B",
  profileId: "profile-B",
  generation: 2,
});
const started = (
  gate = new OfflineRefreshCommitGate(),
  actor = A,
  now = 100,
) => {
  const result = gate.begin(actor, now);
  assert.equal(result.status, "TICKET_MOCK_ONLY");
  return { gate, ticket: result.ticket };
};

for (const [name, actor] of [
  ["null", null],
  ["array", []],
  [
    "missing generation",
    { authUserId: "auth-A", profileId: "profile-A", epoch: "session-A" },
  ],
  ["extra credential", { ...A, refreshToken: "fake-secret" }],
  ["inherited identity", Object.create(A)],
  ["wrong generation", { ...A, generation: -1 }],
  ["unsafe identifier", { ...A, authUserId: " auth-A " }],
  ["symbol property", { ...A, [Symbol("secret")]: "x" }],
  [
    "accessor identity",
    Object.defineProperty({ ...A }, "authUserId", { get: () => "auth-A" }),
  ],
  [
    "non-enumerable identity",
    Object.defineProperty({ ...A }, "authUserId", {
      value: "auth-A",
      enumerable: false,
    }),
  ],
  [
    "throwing proxy",
    new Proxy(
      {},
      {
        ownKeys: () => {
          throw Error("secret");
        },
      },
    ),
  ],
]) {
  test(`begin rejects ${name} without issuing a ticket`, () => {
    assert.deepEqual(new OfflineRefreshCommitGate().begin(actor, 100), {
      status: "BLOCKED",
      reason: "INVALID_ACTOR",
    });
  });
}

test("successful local pre-commit fence is one-shot and contains no credentials", () => {
  const { gate, ticket } = started();
  assert.equal(Object.isFrozen(ticket), true);
  assert.deepEqual(gate.complete(ticket, A, 101), {
    status: "ELIGIBLE_MOCK_ONLY",
  });
  assert.deepEqual(gate.complete(ticket, A, 102), {
    status: "BLOCKED",
    reason: "STALE_OR_REPLAYED",
  });
});

test("sign-out invalidation rejects a late refresh result", () => {
  const { gate, ticket } = started();
  gate.invalidate();
  assert.deepEqual(gate.complete(ticket, A, 101), {
    status: "BLOCKED",
    reason: "STALE_OR_REPLAYED",
  });
});

test("account A to B to A with advanced generation cannot commit old refresh", () => {
  const { gate, ticket } = started();
  gate.invalidate();
  const newA = { ...A, generation: 3 };
  assert.deepEqual(gate.complete(ticket, newA, 101), {
    status: "BLOCKED",
    reason: "STALE_OR_REPLAYED",
  });
});

test("actor switch and session epoch change are rejected even without invalidate", () => {
  for (const actor of [
    B,
    { ...A, epoch: "session-new" },
    { ...A, generation: 2 },
    { ...A, profileId: "other" },
  ]) {
    const { gate, ticket } = started();
    assert.deepEqual(gate.complete(ticket, actor, 101), {
      status: "BLOCKED",
      reason: "ACTOR_CHANGED",
    });
  }
});

test("new concurrent begin supersedes the older ticket", () => {
  const { gate, ticket: first } = started();
  const second = gate.begin(A, 101);
  assert.equal(second.status, "TICKET_MOCK_ONLY");
  assert.deepEqual(gate.complete(first, A, 102), {
    status: "BLOCKED",
    reason: "STALE_OR_REPLAYED",
  });
  assert.deepEqual(gate.complete(second.ticket, A, 103), {
    status: "ELIGIBLE_MOCK_ONLY",
  });
});

test("a forged structurally identical ticket cannot replace object identity", () => {
  const { gate, ticket } = started();
  assert.deepEqual(gate.complete({ ...ticket }, A, 101), {
    status: "BLOCKED",
    reason: "STALE_OR_REPLAYED",
  });
  assert.deepEqual(gate.complete(ticket, A, 102), {
    status: "ELIGIBLE_MOCK_ONLY",
  });
});

test("invalid completion actor burns ticket", () => {
  const { gate, ticket } = started();
  assert.deepEqual(gate.complete(ticket, { ...A, accessToken: "fake" }, 101), {
    status: "BLOCKED",
    reason: "INVALID_ACTOR",
  });
  assert.deepEqual(gate.complete(ticket, A, 102), {
    status: "BLOCKED",
    reason: "STALE_OR_REPLAYED",
  });
});

test("time rollback, expiry and invalid clocks fail closed", () => {
  for (const [time, reason] of [
    [99, "INVALID_CLOCK"],
    [30100, "EXPIRED"],
    [NaN, "INVALID_CLOCK"],
    [-1, "INVALID_CLOCK"],
  ]) {
    const { gate, ticket } = started();
    assert.deepEqual(gate.complete(ticket, A, time), {
      status: "BLOCKED",
      reason,
    });
  }
});

test("bad begin time invalidates previous ticket", () => {
  const { gate, ticket } = started();
  assert.deepEqual(gate.begin(A, Number.MAX_SAFE_INTEGER), {
    status: "BLOCKED",
    reason: "INVALID_CLOCK",
  });
  assert.deepEqual(gate.complete(ticket, A, 101), {
    status: "BLOCKED",
    reason: "STALE_OR_REPLAYED",
  });
});

test("TTL must be a positive safe integer", () => {
  for (const ttl of [0, -1, NaN, Infinity, 0.5]) {
    assert.throws(() => new OfflineRefreshCommitGate(ttl), /INVALID_TTL/);
  }
});

test("complete rejects accessor/proxy actor without leaking trap errors", () => {
  const { gate, ticket } = started();
  const actor = new Proxy(A, {
    getPrototypeOf: () => {
      throw Error("private");
    },
  });
  assert.deepEqual(gate.complete(ticket, actor, 101), {
    status: "BLOCKED",
    reason: "INVALID_ACTOR",
  });
});
