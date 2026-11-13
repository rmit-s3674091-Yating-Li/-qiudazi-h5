import test from "node:test";
import assert from "node:assert/strict";
import { PendingIntentGate } from "../src/core/pending-intent.ts";

const invite = { kind: "connection_invite", inviteRef: "invite-123456" };
const event = { kind: "event_view", eventId: "event-123" };
const actor = { authUserId: "auth-123", generation: 2 };
const current = (id, generation) => id === "auth-123" && generation === 2;
const request = "request-123456";

function boundGate(now = () => 1000) {
  const gate = new PendingIntentGate(now, 100);
  assert.equal(gate.capture(invite, request), "READY");
  assert.equal(gate.bindAfterVerifiedLogin(request, actor, current), "READY");
  return gate;
}

test("non-boolean truthy confirmation never unlocks an invitation", () => {
  for (const forged of ["yes", 1, {}, []]) {
    const gate = boundGate();
    assert.deepEqual(gate.consumeNavigation(actor, current, forged), {
      status: "CONFIRM_REQUIRED",
    });
    assert.deepEqual(gate.consumeNavigation(actor, current, true), {
      status: "NAVIGATE_ONLY",
      intent: invite,
    });
  }
});

test("non-finite clock cannot extend or consume pending navigation", () => {
  for (const invalid of [NaN, Infinity, -Infinity, 1.5, -1]) {
    let now = 1000;
    const gate = boundGate(() => now);
    now = invalid;
    assert.deepEqual(gate.consumeNavigation(actor, current, true), {
      status: "NOT_FOUND",
    });
    now = 1001;
    assert.deepEqual(gate.consumeNavigation(actor, current, true), {
      status: "NOT_FOUND",
    });
  }
});

test("invalid clock cannot create a future-valid intent", () => {
  let now = NaN;
  const gate = new PendingIntentGate(() => now, 100);
  assert.equal(gate.capture(event, request), "INVALID_INTENT");
  now = 1000;
  assert.equal(
    gate.bindAfterVerifiedLogin(request, actor, current),
    "NOT_FOUND",
  );
});

test("clock callback errors fail closed and burn the pending intent", () => {
  let broken = false;
  const gate = boundGate(() => {
    if (broken) throw new Error("CLOCK_UNAVAILABLE");
    return 1000;
  });
  broken = true;
  assert.deepEqual(gate.consumeNavigation(actor, current, true), {
    status: "NOT_FOUND",
  });
  broken = false;
  assert.deepEqual(gate.consumeNavigation(actor, current, true), {
    status: "NOT_FOUND",
  });
});

test("malformed actor and failing session-current callback clear the intent", () => {
  for (const badActor of [
    null,
    undefined,
    {},
    { authUserId: "auth-123", generation: NaN },
  ]) {
    const gate = boundGate();
    assert.deepEqual(gate.consumeNavigation(badActor, current, true), {
      status: "STALE_ACTOR",
    });
    assert.deepEqual(gate.consumeNavigation(actor, current, true), {
      status: "NOT_FOUND",
    });
  }
  const gate = boundGate();
  assert.deepEqual(
    gate.consumeNavigation(
      actor,
      () => {
        throw new Error("SESSION_LOST");
      },
      true,
    ),
    { status: "STALE_ACTOR" },
  );
});

test("malformed actor and non-boolean callback never bind a pending intent", () => {
  for (const invalid of [
    null,
    undefined,
    { authUserId: "auth-123", generation: -1 },
  ]) {
    const gate = new PendingIntentGate(() => 1000, 100);
    assert.equal(gate.capture(event, request), "READY");
    assert.equal(
      gate.bindAfterVerifiedLogin(request, invalid, current),
      "STALE_ACTOR",
    );
  }
  const gate = new PendingIntentGate(() => 1000, 100);
  assert.equal(gate.capture(event, request), "READY");
  assert.equal(
    gate.bindAfterVerifiedLogin(request, actor, () => "yes"),
    "STALE_ACTOR",
  );
});

test("valid explicit confirmation and normal public navigation still work", () => {
  const gate = boundGate();
  assert.deepEqual(gate.consumeNavigation(actor, current), {
    status: "CONFIRM_REQUIRED",
  });
  assert.deepEqual(gate.consumeNavigation(actor, current, true), {
    status: "NAVIGATE_ONLY",
    intent: invite,
  });
  const publicGate = new PendingIntentGate(() => 1000, 100);
  assert.equal(publicGate.capture(event, request), "READY");
  assert.equal(
    publicGate.bindAfterVerifiedLogin(request, actor, current),
    "READY",
  );
  assert.deepEqual(publicGate.consumeNavigation(actor, current), {
    status: "NAVIGATE_ONLY",
    intent: event,
  });
});
