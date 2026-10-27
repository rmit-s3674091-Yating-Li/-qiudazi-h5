import test from "node:test";
import assert from "node:assert/strict";
import { ActorScopedCache } from "../src/core/scoped-cache.ts";
import { UnprovenSessionPort } from "../src/core/ports.ts";

const a1 = { authUserId: "auth-A", profileId: "profile-A", epoch: "epoch-1" };
const b1 = { authUserId: "auth-B", profileId: "profile-B", epoch: "epoch-2" };
const a2 = { ...a1, epoch: "epoch-3" };
function fixture(
  session = { getVerifiedActor: async () => a1 },
  now = () => 1000,
  ttl = 100,
) {
  const data = new Map();
  const storage = {
    async read(key) {
      return data.get(key) ?? null;
    },
    async write(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
  };
  return {
    cache: new ActorScopedCache(storage, session, "event", "summary", now, ttl),
    data,
    storage,
  };
}

test("unproven session never reads or writes protected cache", async () => {
  const { cache, data } = fixture(new UnprovenSessionPort());
  assert.deepEqual(await cache.put({ name: "match" }), {
    status: "UNVERIFIED",
  });
  assert.deepEqual(await cache.get(), { status: "UNVERIFIED" });
  assert.equal(data.size, 0);
});
test("same verified actor can read a defensive copy", async () => {
  const { cache } = fixture();
  const value = { title: "final", players: ["A", "B"] };
  assert.deepEqual(await cache.put(value), { status: "STORED" });
  value.players[0] = "tampered";
  assert.deepEqual(await cache.get(), {
    status: "READY",
    value: { title: "final", players: ["A", "B"] },
  });
});
test("A→B and A→B→A old epoch never expose A cache", async () => {
  let actor = a1;
  const { cache } = fixture({ getVerifiedActor: async () => actor });
  await cache.put({ privateView: "A" });
  actor = b1;
  assert.deepEqual(await cache.get(), { status: "STALE_ACTOR" });
  actor = a2;
  assert.deepEqual(await cache.get(), { status: "STALE_ACTOR" });
});
test("same Auth UUID with changed profile or epoch is stale", async () => {
  let actor = a1;
  const { cache } = fixture({ getVerifiedActor: async () => actor });
  await cache.put("A");
  actor = { ...a1, profileId: "profile-other" };
  assert.deepEqual(await cache.get(), { status: "STALE_ACTOR" });
  actor = a2;
  assert.deepEqual(await cache.get(), { status: "STALE_ACTOR" });
});
test("actor switch during async read fails closed", async () => {
  let actor = a1,
    release;
  const { cache, storage } = fixture({ getVerifiedActor: async () => actor });
  await cache.put("A");
  const read = storage.read;
  storage.read = async (key) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    return read(key);
  };
  const pending = cache.get();
  await new Promise((resolve) => setImmediate(resolve));
  actor = b1;
  release();
  assert.deepEqual(await pending, { status: "STALE_ACTOR" });
});
test("actor switch during async write cannot produce success", async () => {
  let actor = a1,
    release;
  const { cache, storage } = fixture({ getVerifiedActor: async () => actor });
  const write = storage.write;
  storage.write = async (key, value) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    return write(key, value);
  };
  const pending = cache.put("A");
  await new Promise((resolve) => setImmediate(resolve));
  actor = b1;
  release();
  assert.deepEqual(await pending, { status: "STALE_ACTOR" });
  assert.deepEqual(await cache.get(), { status: "STALE_ACTOR" });
});
test("expiry and clock rollback never return cached data", async () => {
  let time = 1000;
  const { cache } = fixture(undefined, () => time);
  await cache.put("A");
  time = 999;
  assert.deepEqual(await cache.get(), { status: "INVALID_CACHE" });
  time = 1100;
  assert.deepEqual(await cache.get(), { status: "EXPIRED" });
});
test("credential fields, accessors, cycles and malformed values are rejected", async () => {
  const { cache } = fixture();
  for (const value of [
    { access_token: "fake" },
    { accessToken: "fake" },
    { nested: { refresh_token: "fake" } },
    {
      get name() {
        throw new Error("getter");
      },
    },
    { secret: "fake" },
    { n: Infinity },
    undefined,
  ])
    assert.deepEqual(await cache.put(value), { status: "INVALID_VALUE" });
  const cycle = {};
  cycle.self = cycle;
  assert.deepEqual(await cache.put(cycle), { status: "INVALID_VALUE" });
});
test("malformed or injected cache is not trusted", async () => {
  const { cache, data } = fixture();
  await cache.put({ ok: true });
  const key = [...data.keys()][0];
  data.set(key, "not-json");
  assert.deepEqual(await cache.get(), { status: "INVALID_CACHE" });
  data.set(
    key,
    JSON.stringify({
      version: 1,
      actor: a1,
      createdAt: 1000,
      expiresAt: 1100,
      value: { jwt: "fake" },
    }),
  );
  assert.deepEqual(await cache.get(), { status: "INVALID_CACHE" });
});
test("session errors and storage errors fail closed", async () => {
  const { cache } = fixture({
    getVerifiedActor: async () => {
      throw new Error("no session");
    },
  });
  assert.deepEqual(await cache.get(), { status: "UNVERIFIED" });
  const store = {
    async read() {
      throw new Error("read fail");
    },
    async write() {
      throw new Error("write fail");
    },
    async remove() {
      throw new Error("remove fail");
    },
  };
  const bad = new ActorScopedCache(
    store,
    { getVerifiedActor: async () => a1 },
    "event",
    "summary",
  );
  assert.deepEqual(await bad.get(), { status: "STORAGE_ERROR" });
  assert.deepEqual(await bad.put("A"), { status: "STORAGE_ERROR" });
  assert.equal(await bad.purge(), "STORAGE_ERROR");
});
test("purge clears cached view data", async () => {
  const { cache, data } = fixture();
  await cache.put("A");
  assert.equal(data.size, 1);
  assert.equal(await cache.purge(), "PURGED");
  assert.deepEqual(await cache.get(), { status: "NOT_FOUND" });
});
test("invalid namespaces and TTL are rejected before storage access", () => {
  const { storage } = fixture();
  for (const ns of ["../auth", "A", "", "auth:user", "auth.jwt"])
    assert.throws(
      () =>
        new ActorScopedCache(storage, new UnprovenSessionPort(), ns, "summary"),
      /INVALID_CACHE_CONFIG/,
    );
  assert.throws(
    () =>
      new ActorScopedCache(
        storage,
        new UnprovenSessionPort(),
        "event",
        "summary",
        Date.now,
        0,
      ),
    /INVALID_CACHE_CONFIG/,
  );
});

test("forged overlong TTL and giant sparse array are rejected", async () => {
  const { cache, data } = fixture();
  assert.deepEqual(await cache.put(new Array(1000000)), {
    status: "INVALID_VALUE",
  });
  await cache.put("A");
  const key = [...data.keys()][0];
  data.set(
    key,
    JSON.stringify({
      version: 1,
      actor: a1,
      createdAt: 1000,
      expiresAt: 999999,
      value: "A",
    }),
  );
  assert.deepEqual(await cache.get(), { status: "INVALID_CACHE" });
});
