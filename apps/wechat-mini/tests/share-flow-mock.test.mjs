import test from "node:test";
import assert from "node:assert/strict";
import { OfflineShareFlow } from "../src/core/share-flow-mock.ts";
import { UnprovenSessionPort } from "../src/core/ports.ts";

const intents = [
  { kind: "event_view", eventId: "event-123" },
  { kind: "private_preview", eventId: "event-123" },
  { kind: "connection_invite", inviteRef: "connection-123" },
  { kind: "player_claim", inviteRef: "claim-ref-123" },
  { kind: "event_invite", inviteKind: "standard", inviteRef: "invite-ref-123" },
  { kind: "score_match", eventId: "event-123", matchId: "match-456" },
];

for (const intent of intents) {
  test(`six-intent offline lifecycle: ${intent.kind}`, () => {
    const flow = new OfflineShareFlow();
    assert.equal(flow.capture(intent), "READY");
    assert.deepEqual(flow.resumeNavigation(), {
      status: "MOCK_SESSION_REQUIRED",
    });
    assert.equal(flow.simulateLocalActor("A"), "READY");
    const sensitive = [
      "connection_invite",
      "player_claim",
      "event_invite",
    ].includes(intent.kind);
    if (sensitive) {
      assert.deepEqual(flow.resumeNavigation(), { status: "CONFIRM_REQUIRED" });
      assert.deepEqual(flow.resumeNavigation("yes"), {
        status: "CONFIRM_REQUIRED",
      });
    }
    assert.deepEqual(flow.resumeNavigation(true), {
      status: "NAVIGATE_ONLY",
      intent,
    });
    assert.deepEqual(flow.resumeNavigation(true), {
      status: "MOCK_SESSION_REQUIRED",
    });
  });
}

test("new intent cannot silently overwrite an existing pending share", () => {
  const flow = new OfflineShareFlow();
  assert.equal(flow.capture(intents[0]), "READY");
  assert.equal(flow.capture(intents[2]), "REPLACEMENT_CONFIRM_REQUIRED");
  assert.equal(flow.simulateLocalActor("A"), "READY");
  assert.deepEqual(flow.resumeNavigation(), {
    status: "NAVIGATE_ONLY",
    intent: intents[0],
  });
  flow.reset();
  assert.equal(flow.capture(intents[2]), "READY");
});

test("A → B → A invalidates old pending intent and never restores it", () => {
  const flow = new OfflineShareFlow();
  assert.equal(flow.capture(intents[3]), "READY");
  assert.equal(flow.simulateLocalActor("A"), "READY");
  assert.equal(flow.switchLocalActor("B"), "STALE_ACTOR");
  assert.equal(flow.switchLocalActor("A"), "STALE_ACTOR");
  assert.deepEqual(flow.resumeNavigation(true), {
    status: "MOCK_SESSION_REQUIRED",
  });
  assert.equal(flow.simulateLocalActor("A"), "NOT_FOUND");
});

test("attempted actor replacement on a bound share fails closed", () => {
  const flow = new OfflineShareFlow();
  assert.equal(flow.capture(intents[2]), "READY");
  assert.equal(flow.simulateLocalActor("A"), "READY");
  assert.equal(flow.simulateLocalActor("B"), "STALE_ACTOR");
  assert.deepEqual(flow.resumeNavigation(true), {
    status: "MOCK_SESSION_REQUIRED",
  });
});

test("invalid share and forged mock actor are rejected", () => {
  const flow = new OfflineShareFlow();
  assert.equal(
    flow.capture({ kind: "admin", role: "super_admin" }),
    "INVALID_INTENT",
  );
  assert.equal(flow.capture(intents[0]), "READY");
  assert.equal(flow.simulateLocalActor("nickname-G"), "STALE_ACTOR");
  assert.deepEqual(flow.resumeNavigation(), {
    status: "MOCK_SESSION_REQUIRED",
  });
});

test("expired intent cannot resume even after local actor simulation", () => {
  let now = 1000;
  const flow = new OfflineShareFlow(() => now, 100);
  assert.equal(flow.capture(intents[1]), "READY");
  now = 1100;
  assert.equal(flow.simulateLocalActor("A"), "NOT_FOUND");
  assert.deepEqual(flow.resumeNavigation(), {
    status: "MOCK_SESSION_REQUIRED",
  });
});

test("reset drops pending intent and local actor, without persisted credentials", () => {
  const flow = new OfflineShareFlow();
  assert.equal(flow.capture(intents[4]), "READY");
  assert.equal(flow.simulateLocalActor("A"), "READY");
  flow.reset();
  assert.deepEqual(flow.resumeNavigation(true), {
    status: "MOCK_SESSION_REQUIRED",
  });
  assert.equal(flow.simulateLocalActor("A"), "NOT_FOUND");
  assert.equal(flow.capture(intents[4]), "READY");
  assert.equal(flow.simulateLocalActor("A"), "READY");
});

test("offline harness cannot turn local simulation into a Supabase session", async () => {
  const session = new UnprovenSessionPort();
  const flow = new OfflineShareFlow();
  assert.equal(flow.capture(intents[0]), "READY");
  assert.equal(flow.simulateLocalActor("A"), "READY");
  assert.deepEqual(flow.resumeNavigation(), {
    status: "NAVIGATE_ONLY",
    intent: intents[0],
  });
  assert.equal(await session.getVerifiedActor(), null);
  await assert.rejects(session.refresh(), /SESSION_BRIDGE_UNPROVEN/);
});
