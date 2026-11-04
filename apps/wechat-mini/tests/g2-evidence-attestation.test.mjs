import assert from "node:assert/strict";
import test from "node:test";
import {
  G2_EVIDENCE_KEYS,
  evaluateG2Readiness,
} from "../src/core/g2-readiness.ts";

const allTrue = () =>
  Object.fromEntries(G2_EVIDENCE_KEYS.map((key) => [key, true]));

const blocked = (value) => {
  const result = evaluateG2Readiness(value);
  assert.equal(result.status, "G2_BLOCKED");
  assert.equal(result.sessionBridge, "SESSION_BRIDGE_UNPROVEN");
  assert.equal(result.evidenceLevel, "OFFLINE_DECLARATION_ONLY");
  assert.deepEqual(result.missing, G2_EVIDENCE_KEYS);
};

test("all-true local declarations never prove Auth", () => {
  const result = evaluateG2Readiness(allTrue());
  assert.equal(result.status, "G2_READY_FOR_TEST");
  assert.deepEqual(result.missing, []);
  assert.equal(result.sessionBridge, "SESSION_BRIDGE_UNPROVEN");
  assert.equal(result.evidenceLevel, "OFFLINE_DECLARATION_ONLY");
});

test("prototype-inherited flags cannot complete the checklist", () => {
  blocked(Object.create(allTrue()));
});

test("accessors are rejected without executing side effects", () => {
  const flags = allTrue();
  let called = 0;
  Object.defineProperty(flags, "supabaseUserVerified", {
    enumerable: true,
    get() {
      called += 1;
      throw new Error("should never execute");
    },
  });
  blocked(flags);
  assert.equal(called, 0);
});

test("unknown fields cannot smuggle a fake session status", () => {
  blocked({ ...allTrue(), sessionBridge: "SESSION_VERIFIED" });
});

test("string flags are not accepted as boolean evidence", () => {
  blocked({ ...allTrue(), supabaseUserVerified: "true" });
});

test("symbol fields are not accepted", () => {
  const flags = allTrue();
  flags[Symbol("verified")] = true;
  blocked(flags);
});

test("throwing proxy traps fail closed", () => {
  const flags = new Proxy(allTrue(), {
    ownKeys() {
      throw new Error("malformed evidence");
    },
  });
  blocked(flags);
});

test("invalid evidence record types fail closed", () => {
  class ClaimedEvidence {
    constructor() {
      Object.assign(this, allTrue());
    }
  }
  for (const value of [[], null, new ClaimedEvidence(), () => allTrue()]) {
    blocked(value);
  }
});

test("frozen and null-prototype records are checklist-only", () => {
  const nullPrototype = Object.assign(Object.create(null), allTrue());
  for (const flags of [Object.freeze(allTrue()), nullPrototype]) {
    const result = evaluateG2Readiness(flags);
    assert.equal(result.status, "G2_READY_FOR_TEST");
    assert.equal(result.sessionBridge, "SESSION_BRIDGE_UNPROVEN");
  }
});

test("false and undefined flags remain missing", () => {
  const flags = {
    ...allTrue(),
    foreignRlsDenied: false,
    ownMediaAllowed: undefined,
  };
  const result = evaluateG2Readiness(flags);
  assert.equal(result.status, "G2_BLOCKED");
  assert.deepEqual(result.missing, ["foreignRlsDenied", "ownMediaAllowed"]);
  assert.equal(result.sessionBridge, "SESSION_BRIDGE_UNPROVEN");
});

test("non-enumerable checklist field fails closed", () => {
  const flags = allTrue();
  Object.defineProperty(flags, "refreshRotationVerified", {
    value: true,
    enumerable: false,
  });
  blocked(flags);
});

test("throwing prototype trap fails closed", () => {
  const flags = new Proxy(allTrue(), {
    getPrototypeOf() {
      throw new Error("private failure");
    },
  });
  blocked(flags);
});

test("all readiness outputs and missing lists are frozen", () => {
  for (const flags of [allTrue(), { wechatCodeSingleUse: true }, null]) {
    const result = evaluateG2Readiness(flags);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.missing), true);
    assert.equal(result.sessionBridge, "SESSION_BRIDGE_UNPROVEN");
  }
});

test("nonboolean values reject whole record while undefined remains missing", () => {
  blocked({ ...allTrue(), foreignRlsDenied: 1 });
  const result = evaluateG2Readiness({
    ...allTrue(),
    ownMediaAllowed: undefined,
  });
  assert.equal(result.status, "G2_BLOCKED");
  assert.deepEqual(result.missing, ["ownMediaAllowed"]);
});
