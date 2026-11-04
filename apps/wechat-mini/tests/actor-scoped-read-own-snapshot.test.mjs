import test from "node:test";
import assert from "node:assert/strict";
import { AuthAccountGeneration } from "../src/shared-domain/AuthAccountGeneration.ts";
import { runActorScopedRead } from "../src/core/actor-scoped-read.ts";

const valid = {
  authUserId: "auth-A",
  profileId: "profile-A",
  epoch: "epoch-1",
};
function harness(first, second = first) {
  const generation = new AuthAccountGeneration();
  generation.observe("auth-A");
  let count = 0;
  const session = {
    async getVerifiedActor() {
      return ++count === 1 ? first : second;
    },
    async refresh() {},
    async signOut() {},
  };
  let reads = 0;
  return {
    generation,
    session,
    count: () => count,
    reads: () => reads,
    run: () =>
      runActorScopedRead(session, generation, async (actor) => {
        reads++;
        assert.deepEqual(actor, valid);
        assert.equal(Object.isFrozen(actor), true);
        return "private-event";
      }),
  };
}

test("plain own-data actor is accepted and read exactly once", async () => {
  const h = harness({ ...valid }, { ...valid });
  assert.deepEqual(await h.run(), { status: "READY", value: "private-event" });
  assert.equal(h.reads(), 1);
  assert.equal(h.count(), 2);
});

test("null-prototype actor with exact own-data fields is supported", async () => {
  const actor = Object.assign(Object.create(null), valid);
  const h = harness(actor);
  assert.deepEqual(await h.run(), { status: "READY", value: "private-event" });
});

test("inherited actor identity cannot start a protected read", async () => {
  const inherited = Object.create(valid);
  const h = harness(inherited);
  assert.deepEqual(await h.run(), { status: "UNVERIFIED" });
  assert.equal(h.reads(), 0);
});

test("accessor actor is rejected without invoking getters", async () => {
  let calls = 0;
  const accessor = { ...valid };
  Object.defineProperty(accessor, "profileId", {
    enumerable: true,
    get() {
      calls++;
      return "profile-A";
    },
  });
  const h = harness(accessor);
  assert.deepEqual(await h.run(), { status: "UNVERIFIED" });
  assert.equal(calls, 0);
  assert.equal(h.reads(), 0);
});

test("a getter that changes identity after validation cannot reach reader", async () => {
  let count = 0;
  const unstable = { ...valid };
  Object.defineProperty(unstable, "authUserId", {
    enumerable: true,
    get() {
      return ++count <= 1 ? "auth-A" : "auth-B";
    },
  });
  const h = harness(unstable);
  assert.deepEqual(await h.run(), { status: "UNVERIFIED" });
  assert.equal(count, 0);
  assert.equal(h.reads(), 0);
});

test("non-enumerable identity and hidden extra claims fail closed", async () => {
  for (const mutation of [
    (actor) =>
      Object.defineProperty(actor, "epoch", {
        value: "epoch-1",
        enumerable: false,
      }),
    (actor) =>
      Object.defineProperty(actor, "access_token", {
        value: "secret",
        enumerable: false,
      }),
  ]) {
    const actor = { ...valid };
    mutation(actor);
    const h = harness(actor);
    assert.deepEqual(await h.run(), { status: "UNVERIFIED" });
    assert.equal(h.reads(), 0);
  }
});

test("symbol keys and array instances cannot impersonate actor records", async () => {
  const symbol = { ...valid, [Symbol("secret")]: "hidden" };
  const array = Object.assign([], valid);
  for (const actor of [symbol, array]) {
    const h = harness(actor);
    assert.deepEqual(await h.run(), { status: "UNVERIFIED" });
    assert.equal(h.reads(), 0);
  }
});

test("throwing and revoked Proxy fail closed without invoking read", async () => {
  const hostile = new Proxy(
    { ...valid },
    {
      ownKeys() {
        throw new Error("trap");
      },
    },
  );
  const revoked = Proxy.revocable({ ...valid }, {});
  revoked.revoke();
  for (const actor of [hostile, revoked.proxy]) {
    const h = harness(actor);
    assert.deepEqual(await h.run(), { status: "UNVERIFIED" });
    assert.equal(h.reads(), 0);
  }
});

test("post-read inherited identity fails as STALE_ACTOR", async () => {
  const h = harness({ ...valid }, Object.create(valid));
  assert.deepEqual(await h.run(), { status: "STALE_ACTOR" });
  assert.equal(h.reads(), 1);
});

test("post-read accessor cannot run and cannot certify stale response", async () => {
  let calls = 0;
  const after = { ...valid };
  Object.defineProperty(after, "epoch", {
    enumerable: true,
    get() {
      calls++;
      return "epoch-1";
    },
  });
  const h = harness({ ...valid }, after);
  assert.deepEqual(await h.run(), { status: "STALE_ACTOR" });
  assert.equal(calls, 0);
  assert.equal(h.reads(), 1);
});

test("post-read changed own-data profile is STALE_ACTOR", async () => {
  const h = harness({ ...valid }, { ...valid, profileId: "profile-B" });
  assert.deepEqual(await h.run(), { status: "STALE_ACTOR" });
});
