import test from "node:test";
import assert from "node:assert/strict";
import { readStorageStrict } from "../src/core/strict-storage-read.ts";

function driver(keys, value) {
  if (arguments.length < 2) value = "cached";
  let reads = 0;
  return {
    listKeys: async () => keys,
    readValue: async () => {
      reads += 1;
      return value;
    },
    get reads() {
      return reads;
    },
  };
}

test("known missing key returns null without a storage read", async () => {
  const d = driver(["other"]);
  assert.equal(await readStorageStrict("qiudazi:poc:event:summary", d), null);
  assert.equal(d.reads, 0);
});

test("present key returns the exact stored value", async () => {
  const value = { event: "fixture", version: 2 };
  const d = driver(["qiudazi:poc:event:summary"], value);
  assert.equal(await readStorageStrict("qiudazi:poc:event:summary", d), value);
  assert.equal(d.reads, 1);
});

test("key matching is exact and case-sensitive", async () => {
  const d = driver(["Event:Summary"]);
  assert.equal(await readStorageStrict("event:summary", d), null);
  assert.equal(d.reads, 0);
});

test("key listing failure is not silently treated as a cache miss", async () => {
  await assert.rejects(
    readStorageStrict("key", {
      listKeys: async () => {
        throw new Error("getStorageInfo:fail sensitive-path");
      },
      readValue: async () => "unreachable",
    }),
    { message: "STORAGE_READ_FAILED" },
  );
});

test("present key read failure remains an error", async () => {
  await assert.rejects(
    readStorageStrict("key", {
      listKeys: async () => ["key"],
      readValue: async () => {
        throw new Error("getStorage:fail token-like-value");
      },
    }),
    { message: "STORAGE_READ_FAILED" },
  );
});

test("removal between list and read fails closed", async () => {
  let exists = true;
  await assert.rejects(
    readStorageStrict("key", {
      listKeys: async () => (exists ? ["key"] : []),
      readValue: async () => {
        exists = false;
        throw new Error("data not found");
      },
    }),
    /STORAGE_READ_FAILED/,
  );
});

test("undefined value for an existing key is not accepted as a valid cache hit", async () => {
  await assert.rejects(
    readStorageStrict("key", driver(["key"], undefined)),
    /STORAGE_READ_FAILED/,
  );
});

test("null stored value is returned unchanged", async () => {
  assert.equal(await readStorageStrict("key", driver(["key"], null)), null);
});

test("malformed key list fails closed", async () => {
  for (const keys of [null, {}, "key", ["key", 42]]) {
    await assert.rejects(
      readStorageStrict("key", driver(keys)),
      /STORAGE_READ_FAILED/,
    );
  }
});

test("overlarge key list fails closed", async () => {
  await assert.rejects(
    readStorageStrict("key", driver(Array(10_001).fill("unrelated"))),
    /STORAGE_READ_FAILED/,
  );
});

test("malicious getter on key list cannot escape as a platform exception", async () => {
  const keys = ["key"];
  Object.defineProperty(keys, 0, {
    get: () => {
      throw new Error("secret");
    },
  });
  await assert.rejects(readStorageStrict("key", driver(keys)), {
    message: "STORAGE_READ_FAILED",
  });
});

test("invalid storage keys are rejected before any platform call", async () => {
  let called = false;
  const d = {
    listKeys: async () => {
      called = true;
      return [];
    },
    readValue: async () => {
      called = true;
      return "x";
    },
  };
  for (const key of ["", "bad\nkey", "a\0b", "x".repeat(257), undefined]) {
    await assert.rejects(readStorageStrict(key, d), /INVALID_STORAGE_KEY/);
  }
  assert.equal(called, false);
});

test("unrelated non-ASCII storage keys do not break normal reads", async () => {
  assert.equal(await readStorageStrict("key", driver(["设置", "key"], 7)), 7);
});

test("TaroKeyValue is wired to the strict read guard, not catch-all null", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../src/platform/taro-ports.ts", import.meta.url),
    "utf8",
  );
  const readMethod = source
    .split("async read(key: string)")[1]
    ?.split("async write(")[0];
  assert.match(readMethod ?? "", /return readStorageStrict\(key,/);
  assert.match(readMethod ?? "", /Taro\.getStorageInfo\(\)/);
  assert.doesNotMatch(readMethod ?? "", /catch\s*\{/);
});
