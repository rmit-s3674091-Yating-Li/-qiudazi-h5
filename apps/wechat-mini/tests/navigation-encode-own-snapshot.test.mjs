import test from "node:test";
import assert from "node:assert/strict";
import { encodeMiniPath, decodeMiniPath } from "../src/core/navigation.ts";

const cases = [
  { kind: "event_view", eventId: "event-123" },
  { kind: "private_preview", eventId: "event-123" },
  { kind: "connection_invite", inviteRef: "connect-123456" },
  { kind: "player_claim", inviteRef: "claim-123456" },
  {
    kind: "event_invite",
    inviteKind: "standard",
    inviteRef: "invite-123456",
  },
  {
    kind: "event_invite",
    inviteKind: "doubles",
    inviteRef: "invite-123456",
  },
  { kind: "score_match", eventId: "event-123", matchId: "match-456" },
];
for (const intent of cases) {
  test(`round trip remains canonical: ${intent.kind}${intent.inviteKind ?? ""}`, () => {
    assert.deepEqual(decodeMiniPath(encodeMiniPath(intent)), intent);
  });
}

test("null-prototype own-data intent remains supported", () => {
  const intent = Object.assign(Object.create(null), cases[0]);
  assert.deepEqual(decodeMiniPath(encodeMiniPath(intent)), cases[0]);
});

test("kind getter is never executed", () => {
  let called = 0;
  const input = { eventId: "event-123" };
  Object.defineProperty(input, "kind", {
    enumerable: true,
    get() {
      called++;
      return "event_view";
    },
  });
  assert.throws(() => encodeMiniPath(input), /INVALID_INTENT_SHAPE/);
  assert.equal(called, 0);
});

test("event ID getter is never executed", () => {
  let called = 0;
  const input = { kind: "event_view" };
  Object.defineProperty(input, "eventId", {
    enumerable: true,
    get() {
      called++;
      return "event-123";
    },
  });
  assert.throws(() => encodeMiniPath(input), /INVALID_INTENT_SHAPE/);
  assert.equal(called, 0);
});

test("inherited kind is not treated as an own intent", () => {
  const input = Object.create({ kind: "event_view" });
  input.eventId = "event-123";
  assert.throws(() => encodeMiniPath(input), /INVALID_INTENT_SHAPE/);
});

test("inherited event ID is not treated as own event ID", () => {
  const input = Object.create({ eventId: "event-123" });
  input.kind = "event_view";
  assert.throws(() => encodeMiniPath(input), /INVALID_INTENT_SHAPE/);
});

test("extra credential field fails closed instead of being silently ignored", () => {
  assert.throws(
    () => encodeMiniPath({ ...cases[0], access_token: "secret" }),
    /INVALID_INTENT_SHAPE/,
  );
});

test("extra admin role field fails closed", () => {
  assert.throws(
    () => encodeMiniPath({ ...cases[0], role: "admin" }),
    /INVALID_INTENT_SHAPE/,
  );
});

test("hidden extra field is rejected", () => {
  const input = { ...cases[0] };
  Object.defineProperty(input, "refresh_token", { value: "secret" });
  assert.throws(() => encodeMiniPath(input), /INVALID_INTENT_SHAPE/);
});

test("symbol field is rejected", () => {
  const input = { ...cases[0], [Symbol("secret")]: "secret" };
  assert.throws(() => encodeMiniPath(input), /INVALID_INTENT_SHAPE/);
});

test("array input is rejected", () => {
  const input = Object.assign([], cases[0]);
  assert.throws(() => encodeMiniPath(input), /INVALID_INTENT_SHAPE/);
});

test("throwing ownKeys proxy is rejected without leaking the exception", () => {
  const input = new Proxy(cases[0], {
    ownKeys() {
      throw new Error("secret");
    },
  });
  assert.throws(() => encodeMiniPath(input), /^Error: INVALID_INTENT_SHAPE$/);
});

test("revoked proxy is rejected without crashing", () => {
  const { proxy, revoke } = Proxy.revocable(cases[0], {});
  revoke();
  assert.throws(() => encodeMiniPath(proxy), /INVALID_INTENT_SHAPE/);
});

test("existing invalid event ID check is retained", () => {
  assert.throws(
    () => encodeMiniPath({ kind: "event_view", eventId: "a" }),
    /INVALID_EVENT_ID/,
  );
});

test("existing invalid invite kind check is retained", () => {
  assert.throws(
    () =>
      encodeMiniPath({
        kind: "event_invite",
        inviteKind: "admin",
        inviteRef: "invite-123456",
      }),
    /INVALID_INVITE_KIND/,
  );
});

test("unknown intent kind is rejected", () => {
  assert.throws(
    () => encodeMiniPath({ kind: "admin", eventId: "event-123" }),
    /INVALID_INTENT_SHAPE/,
  );
});
