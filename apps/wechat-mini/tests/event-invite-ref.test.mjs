import test from "node:test";
import assert from "node:assert/strict";
import { encodeMiniPath, decodeMiniPath } from "../src/core/navigation.ts";
import { PendingIntentGate } from "../src/core/pending-intent.ts";

const actor = { authUserId: "auth-user-A", generation: 2 };
const isCurrent = (authUserId, generation) =>
  authUserId === actor.authUserId && generation === actor.generation;
const ref = "invite-opaque-123456";

test("both standard and doubles event invites preserve a distinct opaque reference", () => {
  for (const inviteKind of ["standard", "doubles"]) {
    const intent = { kind: "event_invite", inviteKind, inviteRef: ref };
    const encoded = encodeMiniPath(intent);
    assert.deepEqual(decodeMiniPath(encoded), intent);
    assert.ok(encoded.includes("ref=invite-opaque-123456"));
    assert.equal(encoded.includes("access_token"), false);
    assert.equal(encoded.includes("refresh_token"), false);
  }
});

test("kind-only or malformed event invite cannot resolve or be captured", () => {
  const prefix = "/pages/index/index?kind=event_invite&inviteKind=doubles";
  for (const url of [
    prefix,
    prefix + "&ref=short",
    prefix + "&ref=" + ref + "&ref=another-opaque-123",
    prefix + "&ref=" + ref + "&role=admin",
    prefix + "&ref=%E0%A4%A",
    prefix + "&ref=" + ref + "?unexpected=1",
    "/pages/index/index?kind=event_invite&inviteKind=other&ref=" + ref,
  ])
    assert.equal(decodeMiniPath(url), null, url);
  assert.throws(
    () => encodeMiniPath({ kind: "event_invite", inviteKind: "standard" }),
    /INVALID_INVITE_REF/,
  );
  assert.throws(
    () =>
      encodeMiniPath({
        kind: "event_invite",
        inviteKind: "standard",
        inviteRef: "short",
      }),
    /INVALID_INVITE_REF/,
  );
  const gate = new PendingIntentGate();
  assert.equal(
    gate.capture(
      { kind: "event_invite", inviteKind: "standard" },
      "request-123456",
    ),
    "INVALID_INTENT",
  );
});

test("event invitation survives verified login but requires confirmation and cannot auto-accept", () => {
  const intent = {
    kind: "event_invite",
    inviteKind: "doubles",
    inviteRef: ref,
  };
  const gate = new PendingIntentGate();
  assert.equal(gate.capture(intent, "request-123456"), "READY");
  assert.equal(
    gate.bindAfterVerifiedLogin("request-123456", actor, isCurrent),
    "READY",
  );
  assert.deepEqual(gate.consumeNavigation(actor, isCurrent), {
    status: "CONFIRM_REQUIRED",
  });
  assert.deepEqual(gate.consumeNavigation(actor, isCurrent, true), {
    status: "NAVIGATE_ONLY",
    intent,
  });
  assert.deepEqual(gate.consumeNavigation(actor, isCurrent, true), {
    status: "NOT_FOUND",
  });
});
