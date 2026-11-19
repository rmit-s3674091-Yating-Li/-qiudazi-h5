import test from "node:test";
import assert from "node:assert/strict";
import { createNavigationResolutionGate } from "../src/core/navigation-resolution-gate.ts";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const deferred = () => {
  let done;
  const promise = new Promise((r) => {
    done = r;
  });
  return { promise, done };
};

test("unauthenticated navigation never starts", () => {
  const gate = createNavigationResolutionGate();
  assert.equal(gate.begin(), null);
});
test("invalid identity fails closed", () => {
  const gate = createNavigationResolutionGate();
  assert.throws(() => gate.establishAccount("nickname"), /INVALID_AUTH_UID/);
  assert.equal(gate.begin(), null);
});
test("current result may be displayed, not automatically accepted", async () => {
  const gate = createNavigationResolutionGate();
  gate.establishAccount(A);
  const ticket = gate.begin();
  assert.deepEqual(
    await gate.resolve(ticket, async () => ({ status: "ACTION_CONFIRM" })),
    { status: "CURRENT", value: { status: "ACTION_CONFIRM" } },
  );
});
test("account A to B to A invalidates old A response", async () => {
  const gate = createNavigationResolutionGate();
  gate.establishAccount(A);
  const ticket = gate.begin();
  const wait = deferred();
  const pending = gate.resolve(ticket, () => wait.promise);
  gate.establishAccount(B);
  gate.establishAccount(A);
  wait.done({ status: "ACTION_CONFIRM" });
  assert.deepEqual(await pending, { status: "STALE" });
});
test("new explicit selection invalidates previous response", async () => {
  const gate = createNavigationResolutionGate();
  gate.establishAccount(A);
  const first = gate.begin();
  const wait = deferred();
  const pending = gate.resolve(first, () => wait.promise);
  const second = gate.begin();
  wait.done("old");
  assert.deepEqual(await pending, { status: "STALE" });
  assert.deepEqual(await gate.resolve(second, async () => "new"), {
    status: "CURRENT",
    value: "new",
  });
});
test("logout invalidates response and future requests", async () => {
  const gate = createNavigationResolutionGate();
  gate.establishAccount(A);
  const ticket = gate.begin();
  gate.invalidate();
  let called = false;
  assert.deepEqual(
    await gate.resolve(ticket, async () => {
      called = true;
    }),
    { status: "STALE" },
  );
  assert.equal(called, false);
  assert.equal(gate.begin(), null);
});
test("stale rejection cannot leak into current view", async () => {
  const gate = createNavigationResolutionGate();
  gate.establishAccount(A);
  const ticket = gate.begin();
  const wait = deferred();
  const pending = gate.resolve(ticket, () => wait.promise);
  gate.invalidate();
  wait.done(Promise.reject(new Error("OLD_REQUEST")));
  assert.deepEqual(await pending, { status: "STALE" });
});
test("current rejection remains visible to caller", async () => {
  const gate = createNavigationResolutionGate();
  gate.establishAccount(A);
  const ticket = gate.begin();
  await assert.rejects(
    gate.resolve(ticket, async () => {
      throw new Error("NETWORK");
    }),
    /NETWORK/,
  );
});
