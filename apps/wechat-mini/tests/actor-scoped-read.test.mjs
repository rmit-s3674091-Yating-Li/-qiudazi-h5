import test from "node:test";
import assert from "node:assert/strict";
import { AuthAccountGeneration } from "../src/shared-domain/AuthAccountGeneration.ts";
import { UnprovenSessionPort } from "../src/core/ports.ts";
import { runActorScopedRead } from "../src/core/actor-scoped-read.ts";

const a = { authUserId: "auth-A", profileId: "profile-A", epoch: "epoch-1" };
const b = { authUserId: "auth-B", profileId: "profile-B", epoch: "epoch-2" };
function harness(actor = a) {
  const generation = new AuthAccountGeneration();
  generation.observe(actor.authUserId);
  let current = actor;
  const session = {
    getVerifiedActor: async () => current,
    refresh: async () => {},
    signOut: async () => {},
  };
  return {
    generation,
    session,
    setActor: (next) => {
      current = next;
    },
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve: (value) => resolve(value) };
}

test("unproven session never starts a protected read", async () => {
  let called = 0;
  const generation = new AuthAccountGeneration();
  generation.observe("auth-A");
  assert.deepEqual(
    await runActorScopedRead(
      new UnprovenSessionPort(),
      generation,
      async () => {
        called++;
        return 1;
      },
    ),
    { status: "UNVERIFIED" },
  );
  assert.equal(called, 0);
});

test("same actor and epoch returns a read-only result", async () => {
  const { generation, session } = harness();
  assert.deepEqual(
    await runActorScopedRead(session, generation, async (actor) => {
      assert.deepEqual(actor, a);
      assert.equal(Object.isFrozen(actor), true);
      return { events: ["event-1"] };
    }),
    { status: "READY", value: { events: ["event-1"] } },
  );
});

test("same Auth UUID observation (JWT refresh) keeps the generation stable", async () => {
  const { generation, session } = harness();
  const before = generation.version;
  assert.deepEqual(generation.observe("auth-A"), {
    changed: false,
    generation: before,
  });
  assert.deepEqual(
    await runActorScopedRead(session, generation, async () => "same-session"),
    { status: "READY", value: "same-session" },
  );
});

test("account mismatch before read rejects without invoking loader", async () => {
  const { generation, session } = harness();
  generation.observe("auth-B");
  let called = 0;
  assert.deepEqual(
    await runActorScopedRead(session, generation, async () => {
      called++;
      return 1;
    }),
    { status: "STALE_ACTOR" },
  );
  assert.equal(called, 0);
});

test("A to B switch during read drops old result", async () => {
  const { generation, session, setActor } = harness();
  const started = deferred();
  const finish = deferred();
  const result = runActorScopedRead(session, generation, async () => {
    started.resolve();
    return finish.promise;
  });
  await started.promise;
  setActor(b);
  generation.observe("auth-B");
  finish.resolve({ privateFor: "A" });
  assert.deepEqual(await result, { status: "STALE_ACTOR" });
});

test("A to B to A switch remains stale even if UUID and epoch return to A", async () => {
  const { generation, session, setActor } = harness();
  const started = deferred();
  const finish = deferred();
  const result = runActorScopedRead(session, generation, async () => {
    started.resolve();
    return finish.promise;
  });
  await started.promise;
  setActor(b);
  generation.observe("auth-B");
  setActor(a);
  generation.observe("auth-A");
  finish.resolve("old-A-response");
  assert.deepEqual(await result, { status: "STALE_ACTOR" });
});

test("same Auth UUID but changed Profile or session epoch is stale", async () => {
  for (const after of [
    { ...a, profileId: "profile-other" },
    { ...a, epoch: "epoch-new" },
    null,
  ]) {
    const { generation, session, setActor } = harness();
    const started = deferred();
    const finish = deferred();
    const result = runActorScopedRead(session, generation, async () => {
      started.resolve();
      return finish.promise;
    });
    await started.promise;
    setActor(after);
    finish.resolve("private-A");
    assert.deepEqual(await result, { status: "STALE_ACTOR" });
  }
});

test("sign-out invalidates pending read and thrown reader cannot leak a stale result", async () => {
  const { generation, session, setActor } = harness();
  const started = deferred();
  const finish = deferred();
  const result = runActorScopedRead(session, generation, async () => {
    started.resolve();
    await finish.promise;
    throw new Error("private failure details");
  });
  await started.promise;
  generation.observe(null);
  setActor(null);
  finish.resolve();
  assert.deepEqual(await result, { status: "STALE_ACTOR" });
});

test("session/reader errors and malformed actor fail closed without exposing values", async () => {
  const { generation, session } = harness();
  assert.deepEqual(
    await runActorScopedRead(session, generation, async () => {
      throw new Error("secret");
    }),
    { status: "READ_FAILED" },
  );
  session.getVerifiedActor = async () => {
    throw new Error("secret");
  };
  assert.deepEqual(
    await runActorScopedRead(session, generation, async () => 1),
    { status: "UNVERIFIED" },
  );
  session.getVerifiedActor = async () => ({
    authUserId: "auth-A",
    profileId: "profile-A",
    epoch: "",
  });
  assert.deepEqual(
    await runActorScopedRead(session, generation, async () => 1),
    { status: "UNVERIFIED" },
  );
  session.getVerifiedActor = async () =>
    new Proxy(
      {},
      {
        get: () => {
          throw new Error("trap");
        },
      },
    );
  assert.deepEqual(
    await runActorScopedRead(session, generation, async () => 1),
    { status: "UNVERIFIED" },
  );
});

test("account switch while post-read session check is pending drops result", async () => {
  const { generation, session, setActor } = harness();
  const secondStarted = deferred();
  const secondFinish = deferred();
  let calls = 0;
  session.getVerifiedActor = async () => {
    calls++;
    if (calls === 2) {
      secondStarted.resolve();
      return secondFinish.promise;
    }
    return a;
  };
  const result = runActorScopedRead(
    session,
    generation,
    async () => "A-private",
  );
  await secondStarted.promise;
  generation.observe("auth-B");
  setActor(b);
  secondFinish.resolve(a);
  assert.deepEqual(await result, { status: "STALE_ACTOR" });
});
