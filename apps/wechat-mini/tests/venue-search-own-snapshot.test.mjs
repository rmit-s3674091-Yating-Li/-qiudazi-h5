import test from "node:test";
import assert from "node:assert/strict";
import { classifyVenueSearch } from "../src/core/venue-search.ts";

const valid = () => ({
  id: "mock-1",
  name: "模拟球馆",
  address: "模拟地址",
});
const classify = (payload) =>
  classifyVenueSearch("北京", "模拟", async () => payload);
const invalid = {
  status: "SERVICE_ERROR",
  reason: "INVALID_RESPONSE",
  candidates: [],
};

test("plain own-data candidate remains valid", async () => {
  assert.deepEqual(await classify([valid()]), {
    status: "RESULTS",
    candidates: [valid()],
  });
});

test("empty successful array remains NO_RESULTS", async () => {
  assert.deepEqual(await classify([]), {
    status: "NO_RESULTS",
    candidates: [],
  });
});

test("a nonthrowing getter must never execute or create a candidate", async () => {
  let calls = 0;
  const item = { ...valid() };
  Object.defineProperty(item, "name", {
    enumerable: true,
    get() {
      calls++;
      return "模拟球馆";
    },
  });
  assert.deepEqual(await classify([item]), invalid);
  assert.equal(calls, 0);
});

test("an inherited id cannot identify a POI", async () => {
  const item = Object.create({ id: "inherited-id" });
  Object.assign(item, { name: "模拟球馆", address: "模拟地址" });
  assert.deepEqual(await classify([item]), invalid);
});

test("a sparse array with inherited candidate is not a successful result", async () => {
  const items = new Array(1);
  const inherited = Object.create(Array.prototype);
  Object.defineProperty(inherited, "0", {
    value: valid(),
    configurable: true,
  });
  Object.setPrototypeOf(items, inherited);
  assert.deepEqual(await classify(items), invalid);
});

test("an accessor array slot cannot be evaluated as a POI", async () => {
  let calls = 0;
  const items = [valid()];
  Object.defineProperty(items, "0", {
    get() {
      calls++;
      return valid();
    },
  });
  assert.deepEqual(await classify(items), invalid);
  assert.equal(calls, 0);
});

test("duplicate ids are rejected before ambiguous selection", async () => {
  assert.deepEqual(
    await classify([valid(), { ...valid(), name: "另一候选" }]),
    invalid,
  );
});

test("malformed later candidate never yields partial RESULTS", async () => {
  assert.deepEqual(
    await classify([valid(), { id: "mock-2", name: "不完整" }]),
    invalid,
  );
});

test("50 normal candidates are accepted; 51 are rejected", async () => {
  const items = Array.from({ length: 50 }, (_, i) => ({
    ...valid(),
    id: `mock-${i}`,
  }));
  assert.equal((await classify(items)).status, "RESULTS");
  assert.deepEqual(
    await classify([...items, { ...valid(), id: "mock-50" }]),
    invalid,
  );
});

test("throwing ownKeys/getOwnPropertyDescriptor proxy cannot escape", async () => {
  const proxy = new Proxy(valid(), {
    getOwnPropertyDescriptor() {
      throw new Error("unsafe");
    },
  });
  assert.deepEqual(await classify([proxy]), invalid);
});
