import test from "node:test";
import assert from "node:assert/strict";
import { decodeCanonicalMiniPath } from "../src/core/canonical-navigation.ts";
import { encodeMiniPath } from "../src/core/navigation.ts";

// B95 follow-up: syntax-only adversarial contract. Does not grant event access.
const cases = [
  { kind: "event_view", eventId: "event-123" },
  { kind: "private_preview", eventId: "event-123" },
  { kind: "connection_invite", inviteRef: "connect-123456" },
  { kind: "player_claim", inviteRef: "claim-123456" },
  { kind: "event_invite", inviteKind: "standard", inviteRef: "invite-123456" },
  { kind: "score_match", eventId: "event-123", matchId: "match-456" },
];

for (const intent of cases) {
  test(`strict boundary roundtrip and mutation rejection: ${intent.kind}`, () => {
    const canonical = encodeMiniPath(intent);
    assert.deepEqual(decodeCanonicalMiniPath(canonical), intent);
    const mutations = [
      `${canonical}&extra=1`,
      `${canonical}&`,
      `${canonical}#fragment`,
      `${canonical}%20`,
      `${canonical}\n`,
      `${canonical}\0`,
      `${canonical}&kind=event_view`,
      `${canonical}&__proto__=polluted`,
      `${canonical}&actor=admin`,
      `${canonical}&token=not-a-capability`,
      canonical + "x".repeat(513),
    ];
    for (const path of mutations) {
      assert.equal(
        decodeCanonicalMiniPath(path),
        null,
        `accepted mutation: ${JSON.stringify(path)}`,
      );
    }
  });
}

test("boundary rejects oversized or nonprimitive input without coercion", () => {
  for (const value of [
    "x".repeat(513),
    Object(encodeMiniPath(cases[0])),
    {
      toString() {
        throw new Error("must not coerce");
      },
    },
    new Uint8Array([47, 112]),
    null,
    undefined,
  ]) {
    assert.doesNotThrow(() => decodeCanonicalMiniPath(value));
    assert.equal(decodeCanonicalMiniPath(value), null);
  }
});
