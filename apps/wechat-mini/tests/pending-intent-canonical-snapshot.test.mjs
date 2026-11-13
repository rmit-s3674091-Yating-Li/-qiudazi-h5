import test from "node:test";
import assert from "node:assert/strict";
import { PendingIntentGate } from "../src/core/pending-intent.ts";

const requestId = "request-123456";
const actor = Object.freeze({ authUserId: "auth-123", generation: 2 });
const current = (id, generation) => id === "auth-123" && generation === 2;
const gate = () => new PendingIntentGate(() => 1000, 100);
const bindAndConsume = (g, confirmed = true) => {
  assert.equal(g.bindAfterVerifiedLogin(requestId, actor, current), "READY");
  return g.consumeNavigation(actor, current, confirmed);
};

test("all six navigation kinds remain canonical and navigation-only", () => {
  const intents = [
    { kind: "event_view", eventId: "event-123" },
    { kind: "private_preview", eventId: "event-123" },
    { kind: "connection_invite", inviteRef: "invite-123456" },
    { kind: "player_claim", inviteRef: "claim-123456" },
    { kind: "event_invite", inviteKind: "doubles", inviteRef: "invite-123456" },
    { kind: "score_match", eventId: "event-123", matchId: "match-123" },
  ];
  for (const intent of intents) {
    const g = gate();
    assert.equal(g.capture(intent, requestId), "READY");
    assert.deepEqual(bindAndConsume(g), { status: "NAVIGATE_ONLY", intent });
    assert.deepEqual(g.consumeNavigation(actor, current, true), {
      status: "NOT_FOUND",
    });
  }
});

test("extra credential-bearing fields cannot be captured or returned", () => {
  for (const extra of [
    { access_token: "jwt-sensitive" },
    { refresh_token: "refresh-sensitive" },
    { session_key: "wechat-sensitive" },
    { adminRole: "super_admin" },
  ]) {
    const g = gate();
    assert.equal(
      g.capture(
        { kind: "event_view", eventId: "event-123", ...extra },
        requestId,
      ),
      "INVALID_INTENT",
    );
    assert.equal(
      g.bindAfterVerifiedLogin(requestId, actor, current),
      "NOT_FOUND",
    );
  }
});

test("unknown optional source field is not part of the current contract", () => {
  const g = gate();
  assert.equal(
    g.capture(
      { kind: "event_view", eventId: "event-123", source: "unknown" },
      requestId,
    ),
    "INVALID_INTENT",
  );
});

test("inherited kind is rejected instead of returning incomplete intent", () => {
  const g = gate();
  const inherited = Object.create({ kind: "event_view" });
  inherited.eventId = "event-123";
  assert.equal(g.capture(inherited, requestId), "INVALID_INTENT");
});

test("accessor properties are rejected without invoking the getter", () => {
  let reads = 0;
  const input = { kind: "event_view" };
  Object.defineProperty(input, "eventId", {
    enumerable: true,
    get() {
      reads++;
      return "event-123";
    },
  });
  assert.equal(gate().capture(input, requestId), "INVALID_INTENT");
  assert.equal(reads, 0);
});

test("throwing accessor cannot crash capture", () => {
  const input = { kind: "event_view" };
  Object.defineProperty(input, "eventId", {
    enumerable: true,
    get() {
      throw Error("SECRET");
    },
  });
  assert.equal(gate().capture(input, requestId), "INVALID_INTENT");
});

test("symbol properties and non-enumerable unknown fields fail closed", () => {
  const symbol = {
    kind: "event_view",
    eventId: "event-123",
    [Symbol("hidden")]: "secret",
  };
  assert.equal(gate().capture(symbol, requestId), "INVALID_INTENT");
  const hidden = { kind: "event_view", eventId: "event-123" };
  Object.defineProperty(hidden, "refresh_token", { value: "secret" });
  assert.equal(gate().capture(hidden, requestId), "INVALID_INTENT");
});

test("revoked or throwing reflection proxy is safely rejected", () => {
  const { proxy, revoke } = Proxy.revocable(
    { kind: "event_view", eventId: "event-123" },
    {},
  );
  revoke();
  assert.equal(gate().capture(proxy, requestId), "INVALID_INTENT");
  const evil = new Proxy(
    { kind: "event_view", eventId: "event-123" },
    {
      ownKeys() {
        throw Error("SECRET");
      },
    },
  );
  assert.equal(gate().capture(evil, requestId), "INVALID_INTENT");
});

test("valid null-prototype JSON-like intent is accepted as a clean object", () => {
  const input = Object.assign(Object.create(null), {
    kind: "event_view",
    eventId: "event-123",
  });
  const g = gate();
  assert.equal(g.capture(input, requestId), "READY");
  assert.deepEqual(bindAndConsume(g), {
    status: "NAVIGATE_ONLY",
    intent: { kind: "event_view", eventId: "event-123" },
  });
});

test("post-capture caller mutation cannot alter the saved intent", () => {
  const input = { kind: "event_view", eventId: "event-123" };
  const g = gate();
  assert.equal(g.capture(input, requestId), "READY");
  input.eventId = "event-999";
  assert.deepEqual(bindAndConsume(g), {
    status: "NAVIGATE_ONLY",
    intent: { kind: "event_view", eventId: "event-123" },
  });
});

test("invalid new intent cannot replace an already pending valid intent", () => {
  const g = gate();
  assert.equal(
    g.capture({ kind: "event_view", eventId: "event-123" }, requestId),
    "READY",
  );
  assert.equal(
    g.capture(
      { kind: "event_view", eventId: "event-999", jwt: "secret" },
      "request-999999",
    ),
    "INVALID_INTENT",
  );
  assert.deepEqual(bindAndConsume(g), {
    status: "NAVIGATE_ONLY",
    intent: { kind: "event_view", eventId: "event-123" },
  });
});

test("an invitation still requires explicit confirmation after canonicalization", () => {
  const g = gate();
  const intent = { kind: "connection_invite", inviteRef: "invite-123456" };
  assert.equal(g.capture(intent, requestId), "READY");
  assert.equal(g.bindAfterVerifiedLogin(requestId, actor, current), "READY");
  assert.deepEqual(g.consumeNavigation(actor, current, false), {
    status: "CONFIRM_REQUIRED",
  });
  assert.deepEqual(g.consumeNavigation(actor, current, true), {
    status: "NAVIGATE_ONLY",
    intent,
  });
});
