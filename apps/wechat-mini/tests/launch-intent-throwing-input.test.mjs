import test from "node:test";
import assert from "node:assert/strict";
import { decodeMiniLaunchIntent } from "../src/core/launch-intent.ts";

const page = "/pages/index/index";
const valid = { kind: "event_view", eventId: "event-123" };

test("malformed UTF-16 query values fail closed rather than crashing render", () => {
  for (const eventId of ["\uD800", "\uDC00", "event-\uD800", "event-\uDC00"]) {
    assert.equal(decodeMiniLaunchIntent(page, { ...valid, eventId }), null);
  }
});

test("throwing getPrototypeOf trap fails closed", () => {
  const hostile = new Proxy(valid, {
    getPrototypeOf() {
      throw new Error("REFLECTION_FAILURE");
    },
  });
  assert.equal(decodeMiniLaunchIntent(page, hostile), null);
});

test("throwing ownKeys and descriptor traps fail closed", () => {
  const ownKeys = new Proxy(valid, {
    ownKeys() {
      throw new Error("KEYS_UNAVAILABLE");
    },
  });
  const descriptor = new Proxy(valid, {
    getOwnPropertyDescriptor() {
      throw new Error("DESCRIPTOR_UNAVAILABLE");
    },
  });
  assert.equal(decodeMiniLaunchIntent(page, ownKeys), null);
  assert.equal(decodeMiniLaunchIntent(page, descriptor), null);
});

test("revoked Proxy is rejected without throwing", () => {
  const { proxy, revoke } = Proxy.revocable(valid, {});
  revoke();
  assert.equal(decodeMiniLaunchIntent(page, proxy), null);
});

test("ordinary parsed route still resolves without invoking accessors", () => {
  assert.deepEqual(decodeMiniLaunchIntent(page, valid), valid);
  let called = false;
  const accessor = { kind: "event_view" };
  Object.defineProperty(accessor, "eventId", {
    enumerable: true,
    get() {
      called = true;
      return "event-123";
    },
  });
  assert.equal(decodeMiniLaunchIntent(page, accessor), null);
  assert.equal(called, false);
});
