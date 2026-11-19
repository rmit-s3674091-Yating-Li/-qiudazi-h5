import test from "node:test";
import assert from "node:assert/strict";
import { decodeCanonicalMiniPath } from "../src/core/canonical-navigation.ts";
import { encodeMiniPath } from "../src/core/navigation.ts";

const intents = [
  { kind: "event_view", eventId: "event-123" },
  { kind: "private_preview", eventId: "event-123" },
  { kind: "connection_invite", inviteRef: "connect-123456" },
  { kind: "player_claim", inviteRef: "claim-123456" },
  { kind: "event_invite", inviteKind: "standard", inviteRef: "invite-123456" },
  { kind: "score_match", eventId: "event-123", matchId: "match-456" },
];
for (const intent of intents) {
  test(`canonical ${intent.kind}`, () => {
    assert.deepEqual(decodeCanonicalMiniPath(encodeMiniPath(intent)), intent);
  });
}
test("reject noncanonical equivalent encodings and unknown fields", () => {
  for (const path of [
    "/pages/index/index?eventId=event-123&kind=event_view",
    "/pages/index/index?kind=event_view&eventId=event%2D123",
    "/pages/index/index?kind=event_view&eventId=event-123&token=secret",
    "/pages/index/index?kind=event_view&eventId=event-123#frag",
  ])
    assert.equal(decodeCanonicalMiniPath(path), null);
});
test("fail closed for nonstrings", () => {
  for (const input of [
    null,
    undefined,
    42,
    {},
    [],
    new String("/pages/index/index?kind=event_view&eventId=event-123"),
  ])
    assert.equal(decodeCanonicalMiniPath(input), null);
});
