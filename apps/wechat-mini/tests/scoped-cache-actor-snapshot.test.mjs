import test from "node:test";
import assert from "node:assert/strict";
import { ActorScopedCache } from "../src/core/scoped-cache.ts";

const a = { authUserId: "auth-A", profileId: "profile-A", epoch: "epoch-1" };
function fixture(actor = a) {
  const data = new Map();
  const session = { getVerifiedActor: async () => actor };
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
    cache: new ActorScopedCache(
      storage,
      session,
      "event",
      "summary",
      () => 1000,
      100,
    ),
    data,
  };
}

for (const [name, actor] of [
  ["inherited identity", Object.create(a)],
  ["credential-bearing identity", { ...a, access_token: "fake" }],
  ["symbol-bearing identity", { ...a, [Symbol("hidden")]: "fake" }],
  [
    "non-enumerable identity",
    Object.defineProperty({ ...a }, "epoch", { enumerable: false }),
  ],
  ["unexpected role field", { ...a, isAdmin: true }],
]) {
  test(`actor snapshot rejects ${name} without cache write`, async () => {
    const { cache, data } = fixture(actor);
    assert.deepEqual(await cache.put({ publicView: true }), {
      status: "UNVERIFIED",
    });
    assert.equal(data.size, 0);
  });
}

test("actor own getters never run", async () => {
  let reads = 0;
  const actor = {
    get authUserId() {
      reads++;
      return a.authUserId;
    },
    profileId: a.profileId,
    epoch: a.epoch,
  };
  const { cache, data } = fixture(actor);
  assert.deepEqual(await cache.put("safe"), { status: "UNVERIFIED" });
  assert.equal(reads, 0);
  assert.equal(data.size, 0);
});

test("changing getter cannot substitute a different Auth UUID", async () => {
  let reads = 0;
  const actor = {
    get authUserId() {
      return reads++ === 0 ? "auth-A" : "auth-B";
    },
    profileId: a.profileId,
    epoch: a.epoch,
  };
  const { cache, data } = fixture(actor);
  assert.deepEqual(await cache.put("private"), { status: "UNVERIFIED" });
  assert.equal(reads, 0);
  assert.equal(data.size, 0);
});

test("throwing ownKeys trap cannot escape actor verification", async () => {
  const actor = new Proxy(
    { ...a },
    {
      ownKeys() {
        throw new Error("hostile");
      },
    },
  );
  const { cache, data } = fixture(actor);
  assert.deepEqual(await cache.put("private"), { status: "UNVERIFIED" });
  assert.equal(data.size, 0);
});

test("sparse array with a middle hole cannot silently turn into null", async () => {
  const { cache, data } = fixture();
  const sparse = ["first", , "last"];
  assert.deepEqual(await cache.put(sparse), { status: "INVALID_VALUE" });
  assert.equal(data.size, 0);
});

test("nested sparse arrays cannot become invented null values", async () => {
  const { cache } = fixture();
  assert.deepEqual(await cache.put({ rows: [["A", , "C"]] }), {
    status: "INVALID_VALUE",
  });
});

test("dense arrays and ordinary actor retain cache behavior", async () => {
  const { cache } = fixture();
  const value = { rows: [["A", null, "C"]] };
  assert.deepEqual(await cache.put(value), { status: "STORED" });
  assert.deepEqual(await cache.get(), { status: "READY", value });
});

test("null-prototype actor with exact own data fields remains valid", async () => {
  const actor = Object.assign(Object.create(null), a);
  const { cache } = fixture(actor);
  assert.deepEqual(await cache.put("A"), { status: "STORED" });
  assert.deepEqual(await cache.get(), { status: "READY", value: "A" });
});

test("tampered cache actor with extra fields is not accepted", async () => {
  const { cache, data } = fixture();
  assert.deepEqual(await cache.put("A"), { status: "STORED" });
  const key = [...data.keys()][0];
  const envelope = JSON.parse(data.get(key));
  envelope.actor.access_token = "fake";
  data.set(key, JSON.stringify(envelope));
  assert.deepEqual(await cache.get(), { status: "INVALID_CACHE" });
});
