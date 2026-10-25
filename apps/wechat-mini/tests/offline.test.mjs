import test from "node:test";
import assert from "node:assert/strict";
import { encodeMiniPath, decodeMiniPath } from "../src/core/navigation.ts";
import {
  MockWechatCodeVerifier,
  MockLegacyProofVerifier,
  MockIdentityServer,
} from "../src/core/identity-mock.ts";
import { UnprovenSessionPort, OfflineVenuePort } from "../src/core/ports.ts";
import * as original from "../../../src/domain/ScoringEngine.ts";
import * as synced from "../src/shared-domain/ScoringEngine.ts";
import { isValidQuickGroupConfig as h5Quick } from "../../../src/domain/QuickGroupConfig.ts";
import { isValidQuickGroupConfig as miniQuick } from "../src/shared-domain/QuickGroupConfig.ts";
import { AuthAccountGeneration } from "../src/shared-domain/AuthAccountGeneration.ts";

const intents = [
  { kind: "event_view", eventId: "event-123" },
  { kind: "private_preview", eventId: "event-123" },
  { kind: "connection_invite", inviteRef: "token12345" },
  { kind: "player_claim", inviteRef: "token67890" },
  {
    kind: "event_invite",
    inviteKind: "doubles",
    inviteRef: "invite-opaque-123456",
  },
  { kind: "score_match", eventId: "event-123", matchId: "match-456" },
];
test("six NavigationIntent kinds round-trip without credentials", () => {
  for (const intent of intents)
    assert.deepEqual(decodeMiniPath(encodeMiniPath(intent)), intent);
  assert.equal(
    decodeMiniPath("/pages/index/index?kind=score_match&eventId=x&matchId=y"),
    null,
  );
  assert.equal(
    decodeMiniPath("/pages/index/index?kind=admin&role=super_admin"),
    null,
  );
  assert.throws(
    () => encodeMiniPath({ kind: "connection_invite", inviteRef: "abc" }),
    /INVALID_INVITE_REF/,
  );
});

test("same canonical H5 scoring and Quick Group rule results in mini", () => {
  const rules = {
    best_of: 1,
    scoring_type: "points_11",
    custom_games_target: null,
    tiebreak_trigger: null,
    game_scoring: "advantage",
  };
  let a = original.initialScore(),
    b = synced.initialScore();
  // Reach 9:9 before the two winning points; 11 consecutive A points
  // would end the match before the B points could legally be recorded.
  for (const side of [...Array(9).fill(["A", "B"]).flat(), "A", "A"]) {
    a = original.addPoint(rules, a, side);
    b = synced.addPoint(rules, b, side);
    assert.deepEqual(a, b);
  }
  assert.deepEqual(a, b);
  assert.equal(a.winner, "A");
  assert.deepEqual(a.sets, [{ a: 11, b: 9 }]);
  for (const engine of [original, synced]) {
    assert.throws(() => engine.addPoint(rules, a, "B"), {
      code: "MATCH_FINISHED",
    });
  }
  for (const args of [
    [8, 2, 2],
    [8, 2, 4],
    [3, 1, 1],
    [0, 1, 1],
  ])
    assert.equal(h5Quick(...args), miniQuick(...args));
});

test("code is one-use; request replay same nonce is idempotent; changed nonce fails", () => {
  const wx = new MockWechatCodeVerifier(),
    legacy = new MockLegacyProofVerifier();
  const server = new MockIdentityServer(wx, legacy);
  wx.register("code-111111", {
    appId: "app-A",
    openId: "opaque-111",
    unionId: null,
  });
  const req = {
    loginCode: "code-111111",
    requestId: "request-111",
    clientNonce: "nonce-111",
  };
  assert.deepEqual(server.exchange(req), { status: "UNBOUND_IDENTITY" });
  assert.deepEqual(server.exchange(req), { status: "UNBOUND_IDENTITY" });
  assert.equal(
    server.exchange({ ...req, clientNonce: "nonce-222" }).status,
    "CONFLICT_LOCKED",
  );
  assert.equal(
    server.exchange({ ...req, requestId: "request-222" }).status,
    "CONFLICT_LOCKED",
  );
  assert.equal(
    server.confirmLegacyBinding("request-111", "nickname-G", true).status,
    "CONFLICT_LOCKED",
  );
  legacy.register("proof-from-verified-old-session", {
    legacy: { authUserId: "auth-old", profileId: "profile-stable" },
    requestId: "request-111",
    subject: { appId: "app-A", openId: "opaque-111", unionId: null },
    expiresAt: Date.now() + 60_000,
    consentRecorded: true,
  });
  assert.equal(
    server.confirmLegacyBinding(
      "request-111",
      "proof-from-verified-old-session",
      true,
    ).status,
    "SESSION_BRIDGE_UNPROVEN",
  );
  assert.deepEqual(
    server.inspectBinding({
      appId: "app-A",
      openId: "opaque-111",
      unionId: null,
    }),
    { authUserId: "auth-old", profileId: "profile-stable" },
  );
  assert.equal(
    server.confirmLegacyBinding(
      "request-111",
      "proof-from-verified-old-session",
      true,
    ).status,
    "CONFLICT_LOCKED",
  );
});

test("same openId across AppIDs is not same identity, no UnionID auto-merge", () => {
  const wx = new MockWechatCodeVerifier(),
    legacy = new MockLegacyProofVerifier();
  const server = new MockIdentityServer(wx, legacy);
  wx.register("code-aaaaaa", {
    appId: "app-A",
    openId: "openid-111",
    unionId: "union-111",
  });
  wx.register("code-bbbbbb", {
    appId: "app-B",
    openId: "openid-111",
    unionId: "union-111",
  });
  assert.equal(
    server.exchange({
      loginCode: "code-aaaaaa",
      requestId: "request-aaa",
      clientNonce: "nonce-aaa",
    }).status,
    "UNBOUND_IDENTITY",
  );
  assert.equal(
    server.exchange({
      loginCode: "code-bbbbbb",
      requestId: "request-bbb",
      clientNonce: "nonce-bbb",
    }).status,
    "UNBOUND_IDENTITY",
  );
  legacy.register("proof-aaaaaa", {
    legacy: { authUserId: "auth-a", profileId: "profile-a" },
    requestId: "request-aaa",
    subject: { appId: "app-A", openId: "openid-111", unionId: "union-111" },
    expiresAt: Date.now() + 60_000,
    consentRecorded: true,
  });
  assert.equal(
    server.confirmLegacyBinding("request-aaa", "proof-aaaaaa", true).status,
    "SESSION_BRIDGE_UNPROVEN",
  );
  assert.equal(
    server.inspectBinding({
      appId: "app-B",
      openId: "openid-111",
      unionId: "union-111",
    }),
    null,
  );
});

test("protected calls and venue lookup fail closed in offline PoC", async () => {
  const session = new UnprovenSessionPort();
  assert.equal(await session.getVerifiedActor(), null);
  await assert.rejects(session.refresh(), /SESSION_BRIDGE_UNPROVEN/);
  assert.deepEqual(await new OfflineVenuePort().search("北京", "奥森"), []);
});

test("A to B to A identity generation rejects stale async responses", () => {
  const state = new AuthAccountGeneration();
  const a = state.observe("auth-A").generation;
  const b = state.observe("auth-B").generation;
  assert.equal(state.isCurrent("auth-A", a), false);
  assert.equal(state.isCurrent("auth-B", b), true);
  state.observe("auth-A");
  assert.equal(state.isCurrent("auth-A", a), false);
});
