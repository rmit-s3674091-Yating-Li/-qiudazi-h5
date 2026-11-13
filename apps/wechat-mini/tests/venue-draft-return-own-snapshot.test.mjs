import test from "node:test";
import assert from "node:assert/strict";
import { OfflineVenueReturnGate } from "../src/core/venue-draft-return.ts";

const ctx = () => ({
  formKey: "event-1",
  revision: 1,
  screenEpoch: "mount-1",
  city: "北京",
});
const fields = () => ({
  city: "北京",
  venueName: "模拟网球场",
  venueAddress: "测试地址",
  venueSource: "manual",
  specificCourt: null,
  status: "DRAFT_ONLY",
});
const preview = () => ({
  status: "ready_mock_only",
  verification: "OFFLINE_MOCK_ONLY",
  canPersist: false,
  preview: fields(),
});
const gateWithTicket = () => {
  const gate = new OfflineVenueReturnGate();
  const result = gate.issue(ctx(), 1000);
  assert.equal(result.status, "issued_mock_only");
  return { gate, ticket: result.ticket };
};

const contextRejected = (raw) => {
  const gate = new OfflineVenueReturnGate();
  assert.deepEqual(gate.issue(raw, 1000), {
    status: "blocked",
    reason: "INVALID_CONTEXT",
  });
};
const previewRejected = (raw) => {
  const { gate, ticket } = gateWithTicket();
  assert.deepEqual(gate.accept(ticket, ctx(), raw, 1001), {
    status: "blocked",
    reason: "INVALID_PREVIEW",
  });
  assert.equal(
    gate.accept(ticket, ctx(), preview(), 1002).reason,
    "STALE_OR_REPLAYED_TICKET",
  );
};

test("valid context and preview retain offline-only return", () => {
  const { gate, ticket } = gateWithTicket();
  const result = gate.accept(ticket, ctx(), preview(), 1001);
  assert.equal(result.status, "draft_return_mock_only");
  assert.equal(result.canPersist, false);
  assert.deepEqual(result.fields, fields());
});

test("context rejects inherited required property", () => {
  const c = Object.assign(Object.create({ formKey: "event-1" }), ctx());
  delete c.formKey;
  contextRejected(c);
});

test("context rejects getter even when getter returns a valid value", () => {
  const c = ctx();
  Object.defineProperty(c, "formKey", {
    get: () => "event-1",
    enumerable: true,
  });
  contextRejected(c);
});

test("context getter is never invoked", () => {
  const c = ctx();
  let reads = 0;
  Object.defineProperty(c, "city", {
    get: () => {
      reads++;
      return "北京";
    },
    enumerable: true,
  });
  contextRejected(c);
  assert.equal(reads, 0);
});

test("context rejects non-enumerable required field", () => {
  const c = ctx();
  Object.defineProperty(c, "revision", { value: 1, enumerable: false });
  contextRejected(c);
});

test("context rejects extra credential field", () => {
  contextRejected({ ...ctx(), access_token: "must-not-travel" });
});

test("context rejects symbol property", () => {
  contextRejected({ ...ctx(), [Symbol("auth")]: "hidden" });
});

test("context rejects non-plain object", () => {
  contextRejected(Object.assign(Object.create({ inherited: true }), ctx()));
});

test("context rejects revoked Proxy without throwing", () => {
  const p = Proxy.revocable(ctx(), {});
  p.revoke();
  contextRejected(p.proxy);
});

test("preview rejects inherited verification field", () => {
  const p = Object.assign(
    Object.create({ verification: "OFFLINE_MOCK_ONLY" }),
    preview(),
  );
  delete p.verification;
  previewRejected(p);
});

test("preview rejects inherited canPersist false", () => {
  const p = Object.assign(Object.create({ canPersist: false }), preview());
  delete p.canPersist;
  previewRejected(p);
});

test("preview rejects accessor status without invoking it", () => {
  const p = preview();
  let reads = 0;
  Object.defineProperty(p, "status", {
    get: () => {
      reads++;
      return "ready_mock_only";
    },
    enumerable: true,
  });
  previewRejected(p);
  assert.equal(reads, 0);
});

test("nested preview rejects inherited venueName", () => {
  const p = preview();
  p.preview = Object.assign(
    Object.create({ venueName: "模拟网球场" }),
    fields(),
  );
  delete p.preview.venueName;
  previewRejected(p);
});

test("nested preview rejects accessor court without invoking it", () => {
  const p = preview();
  let reads = 0;
  Object.defineProperty(p.preview, "specificCourt", {
    get: () => {
      reads++;
      return null;
    },
    enumerable: true,
  });
  previewRejected(p);
  assert.equal(reads, 0);
});

test("nested preview rejects non-enumerable venueSource", () => {
  const p = preview();
  Object.defineProperty(p.preview, "venueSource", {
    value: "manual",
    enumerable: false,
  });
  previewRejected(p);
});

test("nested preview rejects revoked Proxy without throwing", () => {
  const p = preview();
  const proxy = Proxy.revocable(fields(), {});
  proxy.revoke();
  p.preview = proxy.proxy;
  previewRejected(p);
});

test("extra benign preview metadata is ignored for compatibility", () => {
  const { gate, ticket } = gateWithTicket();
  const p = preview();
  p.preview.note = "ignored";
  const result = gate.accept(ticket, ctx(), p, 1001);
  assert.equal(result.status, "draft_return_mock_only");
  assert.equal(Object.hasOwn(result.fields, "note"), false);
});

test("preview rejects non-plain nested prototype", () => {
  const p = preview();
  p.preview = Object.assign(Object.create({ legacy: true }), fields());
  previewRejected(p);
});
