import test from "node:test";
import assert from "node:assert/strict";
import { OfflineWxLoginAttemptGate } from "../src/core/wx-login-attempt-gate.ts";

const request = () => ({
  login_code: "offline_code_123456",
  request_id: "offline_request_123456",
  client_nonce: "offline_nonce_123456",
});
const response = (
  status = "SESSION_BRIDGE_UNPROVEN",
  next_action = "NONE",
) => ({
  status,
  correlation_id: "mock_correlation_123456",
  next_action,
});
const context = () => {
  let current = 7;
  return {
    value: { generation: 7, isCurrent: (n) => n === current },
    change(n) {
      current = n;
    },
  };
};
const deferred = () => {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
};
const attempt = (body, input = request(), actor = context().value) =>
  new OfflineWxLoginAttemptGate().attempt(input, actor, async () => body);

test("valid mock never claims SESSION_VERIFIED or returns credentials", async () => {
  const result = await attempt(response());
  assert.deepEqual(result, {
    status: "MOCK_EXCHANGE_ONLY",
    protocolStatus: "SESSION_BRIDGE_UNPROVEN",
  });
  assert.equal(JSON.stringify(result).includes("offline_code"), false);
});

test("unbound and binding challenge are mock-only navigation hints", async () => {
  for (const status of [
    "WECHAT_VERIFIED_UNBOUND",
    "BINDING_CHALLENGE_REQUIRED",
  ]) {
    assert.deepEqual(await attempt(response(status, "BIND")), {
      status: "MOCK_EXCHANGE_ONLY",
      protocolStatus: status,
    });
  }
});

test("rejects SESSION_VERIFIED, unknown status and mismatched action", async () => {
  for (const body of [
    response("SESSION_VERIFIED"),
    response("SOMETHING_ELSE"),
    response("CONFLICT_LOCKED", "BIND"),
    response("WECHAT_VERIFIED_UNBOUND", "RETRY"),
  ]) {
    assert.deepEqual(await attempt(body), { status: "PROTOCOL_REJECTED" });
  }
});

test("response refuses tokens, profile IDs, secrets and unknown fields", async () => {
  for (const extra of [
    { access_token: "fake" },
    { refresh_token: "fake" },
    { profile_id: "fake" },
    { app_secret: "fake" },
    { code: "fake" },
  ]) {
    assert.deepEqual(await attempt({ ...response(), ...extra }), {
      status: "PROTOCOL_REJECTED",
    });
  }
});

test("request refuses extra credentials before mock invocation", async () => {
  for (const extra of [
    { appSecret: "fake" },
    { openid: "fake" },
    { access_token: "fake" },
  ]) {
    let invoked = 0;
    const result = await new OfflineWxLoginAttemptGate().attempt(
      { ...request(), ...extra },
      context().value,
      async () => {
        invoked++;
        return response();
      },
    );
    assert.deepEqual(result, { status: "INVALID_INPUT" });
    assert.equal(invoked, 0);
  }
});

test("malformed, missing and inherited request fields fail closed", async () => {
  for (const input of [
    null,
    [],
    {},
    { ...request(), login_code: "short" },
    Object.create(request()),
  ]) {
    assert.deepEqual(await attempt(response(), input), {
      status: "INVALID_INPUT",
    });
  }
});

test("request accessor is not evaluated", async () => {
  let reads = 0;
  const input = request();
  Object.defineProperty(input, "login_code", {
    enumerable: true,
    get() {
      reads++;
      return "offline_code_123456";
    },
  });
  assert.deepEqual(await attempt(response(), input), {
    status: "INVALID_INPUT",
  });
  assert.equal(reads, 0);
});

test("response accessor is not evaluated", async () => {
  let reads = 0;
  const body = response();
  Object.defineProperty(body, "status", {
    enumerable: true,
    get() {
      reads++;
      return "SESSION_BRIDGE_UNPROVEN";
    },
  });
  assert.deepEqual(await attempt(body), { status: "PROTOCOL_REJECTED" });
  assert.equal(reads, 0);
});

test("concurrent calls dispatch once and never retry", async () => {
  const gate = new OfflineWxLoginAttemptGate();
  const hold = deferred();
  let calls = 0;
  const first = gate.attempt(request(), context().value, async () => {
    calls++;
    return hold.promise;
  });
  assert.deepEqual(
    await gate.attempt(request(), context().value, async () => response()),
    { status: "REPLAY_REJECTED" },
  );
  hold.resolve(response());
  assert.equal((await first).status, "MOCK_EXCHANGE_ONLY");
  assert.equal(calls, 1);
  assert.deepEqual(
    await gate.attempt(request(), context().value, async () => response()),
    { status: "REPLAY_REJECTED" },
  );
});

test("ambiguous mock failure burns the code attempt", async () => {
  const gate = new OfflineWxLoginAttemptGate();
  assert.deepEqual(
    await gate.attempt(request(), context().value, async () => {
      throw Error("private");
    }),
    { status: "OUTCOME_UNKNOWN" },
  );
  assert.deepEqual(
    await gate.attempt(request(), context().value, async () => response()),
    { status: "REPLAY_REJECTED" },
  );
});

test("A to B to A generation change invalidates in-flight exchange", async () => {
  const actor = context();
  const hold = deferred();
  const pending = new OfflineWxLoginAttemptGate().attempt(
    request(),
    actor.value,
    async () => hold.promise,
  );
  actor.change(8);
  actor.change(9);
  hold.resolve(response());
  assert.deepEqual(await pending, { status: "STALE_CONTEXT" });
});

test("stale context before exchange prevents mock invocation", async () => {
  const actor = context();
  actor.change(8);
  let calls = 0;
  const result = await new OfflineWxLoginAttemptGate().attempt(
    request(),
    actor.value,
    async () => {
      calls++;
      return response();
    },
  );
  assert.deepEqual(result, { status: "STALE_CONTEXT" });
  assert.equal(calls, 0);
});

test("clock rollback and TTL expiry fail closed after dispatch", async () => {
  for (const end of [99, 110]) {
    let now = 100;
    const gate = new OfflineWxLoginAttemptGate(() => now, 10);
    const result = await gate.attempt(request(), context().value, async () => {
      now = end;
      return response();
    });
    assert.deepEqual(result, { status: "STALE_CONTEXT" });
  }
});

test("invalid clock or throwing current check fail closed", async () => {
  assert.deepEqual(
    await new OfflineWxLoginAttemptGate(() => NaN).attempt(
      request(),
      context().value,
      async () => response(),
    ),
    { status: "STALE_CONTEXT" },
  );
  assert.deepEqual(
    await new OfflineWxLoginAttemptGate().attempt(
      request(),
      {
        generation: 1,
        isCurrent() {
          throw Error("private");
        },
      },
      async () => response(),
    ),
    { status: "STALE_CONTEXT" },
  );
});

test("invalid context and TTL reject without side effects", async () => {
  assert.throws(
    () => new OfflineWxLoginAttemptGate(Date.now, 0),
    /INVALID_MOCK_TTL/,
  );
  let calls = 0;
  const result = await new OfflineWxLoginAttemptGate().attempt(
    request(),
    { generation: -1, isCurrent: () => true },
    async () => {
      calls++;
      return response();
    },
  );
  assert.deepEqual(result, { status: "INVALID_INPUT" });
  assert.equal(calls, 0);
});

test("proxy traps and symbol keys fail closed", async () => {
  const proxied = new Proxy(request(), {
    ownKeys() {
      throw Error("private");
    },
  });
  const symbol = { ...request(), [Symbol("token")]: "private" };
  for (const input of [proxied, symbol]) {
    assert.deepEqual(await attempt(response(), input), {
      status: "INVALID_INPUT",
    });
  }
});

test("context accessors are rejected without invoking them", async () => {
  let reads = 0;
  const actor = context().value;
  Object.defineProperty(actor, "generation", {
    enumerable: true,
    get() {
      reads++;
      return 7;
    },
  });
  assert.deepEqual(await attempt(response(), request(), actor), {
    status: "INVALID_INPUT",
  });
  assert.equal(reads, 0);
});
