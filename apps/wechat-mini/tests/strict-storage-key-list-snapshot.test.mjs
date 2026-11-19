import test from "node:test";
import assert from "node:assert/strict";
import { readStorageStrict } from "../src/core/strict-storage-read.ts";

function driver(keys, value = "cached") {
  let reads = 0;
  return {
    listKeys: async () => keys,
    readValue: async () => {
      reads++;
      return value;
    },
    get reads() {
      return reads;
    },
  };
}
const rejects = async (keys) => {
  const d = driver(keys);
  await assert.rejects(readStorageStrict("key", d), {
    message: "STORAGE_READ_FAILED",
  });
  assert.equal(d.reads, 0);
};

test("normal present and absent key lists retain semantics", async () => {
  const found = driver(["设置", "key"]);
  assert.equal(await readStorageStrict("key", found), "cached");
  assert.equal(found.reads, 1);
  const absent = driver(["other"]);
  assert.equal(await readStorageStrict("key", absent), null);
  assert.equal(absent.reads, 0);
});

test("null or malformed key-list never turns into an absence", async () => {
  await rejects(null);
  await rejects({ 0: "key", length: 1 });
  await rejects(["key", 12]);
});

test("overridden own includes cannot lie about a present key", async () => {
  const keys = ["key"];
  keys.includes = () => false;
  await rejects(keys);
});

test("overridden own iterator cannot hide the key", async () => {
  const keys = ["key"];
  keys[Symbol.iterator] = function* () {};
  await rejects(keys);
});

test("sparse array is not an authoritative absence proof", async () => {
  const keys = Array(2);
  keys[1] = "key";
  await rejects(keys);
});

test("own index accessor is rejected without invoking getter", async () => {
  const keys = ["key"];
  let invoked = 0;
  Object.defineProperty(keys, 0, {
    enumerable: true,
    get() {
      invoked++;
      return "key";
    },
  });
  await rejects(keys);
  assert.equal(invoked, 0);
});

test("nonenumerable hidden own property is rejected", async () => {
  const keys = ["key"];
  Object.defineProperty(keys, "secret", { value: "jwt", enumerable: false });
  await rejects(keys);
});

test("symbol own property is rejected", async () => {
  const keys = ["key"];
  keys[Symbol("hidden")] = "jwt";
  await rejects(keys);
});

test("duplicate keys are not accepted as a canonical key list", async () => {
  await rejects(["key", "key"]);
});

test("array with unexpected prototype is rejected", async () => {
  const keys = ["key"];
  Object.setPrototypeOf(keys, Object.create(Array.prototype));
  await rejects(keys);
});

test("throwing descriptor proxy fails closed", async () => {
  const keys = new Proxy(["key"], {
    getOwnPropertyDescriptor() {
      throw new Error("private token in platform error");
    },
  });
  await rejects(keys);
});

test("throwing ownKeys proxy fails closed with sanitized error", async () => {
  const keys = new Proxy(["key"], {
    ownKeys() {
      throw new Error("secret");
    },
  });
  await rejects(keys);
});

test("reordered ownKeys proxy is not an authoritative listing", async () => {
  const keys = new Proxy(["key"], {
    ownKeys() {
      return ["length", "0"];
    },
  });
  await rejects(keys);
});

test("revoked array proxy fails closed", async () => {
  const { proxy, revoke } = Proxy.revocable(["key"], {});
  revoke();
  await rejects(proxy);
});

test("snapshot does not call custom includes or iterator", async () => {
  const keys = ["key"];
  let called = false;
  keys.includes = () => {
    called = true;
    return false;
  };
  await rejects(keys);
  assert.equal(called, false);
});

test("large but valid list is accepted within bound", async () => {
  const keys = Array.from({ length: 10_000 }, (_, i) => `other-${i}`);
  keys[9999] = "key";
  const d = driver(keys);
  assert.equal(await readStorageStrict("key", d), "cached");
  assert.equal(d.reads, 1);
});
