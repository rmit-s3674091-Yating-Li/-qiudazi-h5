import test from "node:test";
import assert from "node:assert/strict";
import { OfflineShareFlow } from "../src/core/share-flow-mock.ts";

const event = { kind: "event_view", eventId: "event-123" };
const invite = {
  kind: "event_invite",
  inviteKind: "standard",
  inviteRef: "invite-123456",
};
const invalid = { kind: "admin", role: "super_admin" };

test("invalid new launch clears a previously bound public event", () => {
  const flow = new OfflineShareFlow();
  assert.equal(flow.capture(event), "READY");
  assert.equal(flow.simulateLocalActor("A"), "READY");
  assert.equal(flow.capture(invalid), "INVALID_INTENT");
  assert.deepEqual(flow.resumeNavigation(true), {
    status: "MOCK_SESSION_REQUIRED",
  });
  assert.equal(flow.simulateLocalActor("A"), "NOT_FOUND");
});

test("invalid new launch clears a previously confirmed invitation", () => {
  const flow = new OfflineShareFlow();
  assert.equal(flow.capture(invite), "READY");
  assert.equal(flow.simulateLocalActor("A"), "READY");
  assert.deepEqual(flow.resumeNavigation(), { status: "CONFIRM_REQUIRED" });
  assert.equal(flow.capture(invalid), "INVALID_INTENT");
  assert.deepEqual(flow.resumeNavigation(true), {
    status: "MOCK_SESSION_REQUIRED",
  });
});

test("rejected malformed launch cannot resume an earlier unbound share", () => {
  const flow = new OfflineShareFlow();
  assert.equal(flow.capture(event), "READY");
  assert.equal(
    flow.capture({ kind: "score_match", eventId: "x", matchId: "y" }),
    "INVALID_INTENT",
  );
  assert.equal(flow.simulateLocalActor("A"), "NOT_FOUND");
});

test("throwing getter fails closed and does not preserve an earlier share", () => {
  const flow = new OfflineShareFlow();
  assert.equal(flow.capture(event), "READY");
  assert.equal(flow.simulateLocalActor("A"), "READY");
  const hostile = { kind: "event_view" };
  Object.defineProperty(hostile, "eventId", {
    enumerable: true,
    get() {
      throw new Error("UNTRUSTED_GETTER");
    },
  });
  assert.equal(flow.capture(hostile), "INVALID_INTENT");
  assert.deepEqual(flow.resumeNavigation(), {
    status: "MOCK_SESSION_REQUIRED",
  });
});

test("valid replacement remains confirmation-gated and preserves original", () => {
  const flow = new OfflineShareFlow();
  assert.equal(flow.capture(event), "READY");
  assert.equal(flow.capture(invite), "REPLACEMENT_CONFIRM_REQUIRED");
  assert.equal(flow.simulateLocalActor("A"), "READY");
  assert.deepEqual(flow.resumeNavigation(), {
    status: "NAVIGATE_ONLY",
    intent: event,
  });
});

test("after rejection a fresh valid share can be captured and consumed", () => {
  const flow = new OfflineShareFlow();
  assert.equal(flow.capture(event), "READY");
  assert.equal(flow.capture(invalid), "INVALID_INTENT");
  assert.equal(flow.capture(invite), "READY");
  assert.equal(flow.simulateLocalActor("B"), "READY");
  assert.deepEqual(flow.resumeNavigation(), { status: "CONFIRM_REQUIRED" });
  assert.deepEqual(flow.resumeNavigation(true), {
    status: "NAVIGATE_ONLY",
    intent: invite,
  });
});
