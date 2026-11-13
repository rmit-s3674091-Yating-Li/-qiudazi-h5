import test from "node:test";
import assert from "node:assert/strict";
import { OfflineVenueReturnGate } from "../src/core/venue-draft-return.ts";
import { prepareOfflineCourtPreview } from "../src/core/venue-court-draft.ts";

const context = (overrides = {}) => ({
  formKey: "create-event-1",
  revision: 2,
  screenEpoch: "mount-17",
  city: "北京",
  ...overrides,
});
const preview = (overrides = {}) =>
  prepareOfflineCourtPreview(
    {
      city: "北京",
      name: "模拟球馆",
      address: "虚构地址",
      source: "mock_poi",
      status: "DRAFT_ONLY",
      ...overrides,
    },
    "B区2号场",
  );
const issued = (gate, ctx = context(), time = 1000) => {
  const result = gate.issue(ctx, time);
  assert.equal(result.status, "issued_mock_only");
  return result.ticket;
};

test("accepts a single valid offline preview and copies only approved fields", () => {
  const gate = new OfflineVenueReturnGate();
  const ticket = issued(gate);
  const input = preview();
  input.preview.secret = "should-not-leak";
  const result = gate.accept(ticket, context(), input, 1001);
  assert.equal(result.status, "draft_return_mock_only");
  assert.equal(result.canPersist, false);
  assert.equal(result.verification, "OFFLINE_MOCK_ONLY");
  assert.deepEqual(Object.keys(result.fields).sort(), [
    "city",
    "specificCourt",
    "status",
    "venueAddress",
    "venueName",
    "venueSource",
  ]);
  assert.equal(result.fields.specificCourt, "B区2号场");
  assert.equal(
    gate.accept(ticket, context(), input, 1002).reason,
    "STALE_OR_REPLAYED_TICKET",
  );
});

test("allows manual venue without a specific court", () => {
  const gate = new OfflineVenueReturnGate();
  const ticket = issued(gate);
  const p = prepareOfflineCourtPreview(
    {
      city: "北京",
      name: "手填馆",
      address: "手填地址",
      source: "manual",
      status: "DRAFT_ONLY",
    },
    "",
  );
  const result = gate.accept(ticket, context(), p, 1001);
  assert.equal(result.status, "draft_return_mock_only");
  assert.equal(result.fields.specificCourt, null);
});

test("rejects changed form revision and consumes the ticket", () => {
  const gate = new OfflineVenueReturnGate();
  const ticket = issued(gate);
  assert.equal(
    gate.accept(ticket, context({ revision: 3 }), preview(), 1001).reason,
    "FORM_CHANGED",
  );
  assert.equal(
    gate.accept(ticket, context(), preview(), 1002).reason,
    "STALE_OR_REPLAYED_TICKET",
  );
});

test("rejects A-B-A city changes when revision changed", () => {
  const gate = new OfflineVenueReturnGate();
  const ticket = issued(gate);
  assert.equal(
    gate.accept(ticket, context({ revision: 4 }), preview(), 1001).reason,
    "FORM_CHANGED",
  );
});

test("rejects remounted parent form even with same city and revision", () => {
  const gate = new OfflineVenueReturnGate();
  const ticket = issued(gate);
  assert.equal(
    gate.accept(ticket, context({ screenEpoch: "mount-18" }), preview(), 1001)
      .reason,
    "FORM_CHANGED",
  );
});

test("new issue invalidates the old ticket", () => {
  const gate = new OfflineVenueReturnGate();
  const old = issued(gate);
  const current = issued(gate);
  assert.equal(
    gate.accept(old, context(), preview(), 1001).reason,
    "STALE_OR_REPLAYED_TICKET",
  );
  assert.equal(
    gate.accept(current, context(), preview(), 1001).status,
    "draft_return_mock_only",
  );
});

test("explicit invalidation rejects a previously issued ticket", () => {
  const gate = new OfflineVenueReturnGate();
  const ticket = issued(gate);
  gate.invalidate();
  assert.equal(
    gate.accept(ticket, context(), preview(), 1001).reason,
    "STALE_OR_REPLAYED_TICKET",
  );
});

test("rejects expired ticket and clock rollback", () => {
  const gate = new OfflineVenueReturnGate();
  const t1 = issued(gate);
  assert.equal(gate.accept(t1, context(), preview(), 601001).reason, "EXPIRED");
  const t2 = issued(gate);
  assert.equal(
    gate.accept(t2, context(), preview(), 999).reason,
    "INVALID_CLOCK",
  );
});

test("invalid clocks and contexts never issue a ticket", () => {
  const gate = new OfflineVenueReturnGate();
  for (const clock of [NaN, Infinity, -1, 1.2, "1000"])
    assert.equal(gate.issue(context(), clock).status, "blocked");
  for (const ctx of [
    null,
    {},
    context({ city: "杭州" }),
    context({ revision: -1 }),
    context({ screenEpoch: "" }),
    context({ formKey: "x/secret" }),
  ])
    assert.equal(gate.issue(ctx, 1000).reason, "INVALID_CONTEXT");
});

test("forged persisted or verified preview is blocked", () => {
  const gate = new OfflineVenueReturnGate();
  for (const change of [
    { canPersist: true },
    { verification: "REAL_VERIFIED" },
    { status: "SESSION_VERIFIED" },
  ]) {
    const ticket = issued(gate);
    assert.equal(
      gate.accept(ticket, context(), { ...preview(), ...change }, 1001).reason,
      "INVALID_PREVIEW",
    );
  }
});

test("cross-city preview is blocked", () => {
  const gate = new OfflineVenueReturnGate();
  const ticket = issued(gate);
  assert.equal(
    gate.accept(ticket, context(), preview({ city: "上海" }), 1001).reason,
    "CITY_MISMATCH",
  );
});

test("forged court field and malformed preview are blocked", () => {
  const gate = new OfflineVenueReturnGate();
  const a = issued(gate);
  assert.equal(
    gate.accept(
      a,
      context(),
      {
        ...preview(),
        preview: { ...preview().preview, specificCourt: { x: 1 } },
      },
      1001,
    ).reason,
    "INVALID_PREVIEW",
  );
  const b = issued(gate);
  assert.equal(
    gate.accept(b, context(), { status: "ready_mock_only" }, 1001).reason,
    "INVALID_PREVIEW",
  );
});

test("malicious getters fail closed without leaking exception", () => {
  const gate = new OfflineVenueReturnGate();
  const ticket = issued(gate);
  assert.equal(
    gate.accept(
      ticket,
      context(),
      {
        get status() {
          throw new Error("secret");
        },
      },
      1001,
    ).reason,
    "INVALID_PREVIEW",
  );
  assert.equal(
    gate.accept(ticket, context(), preview(), 1002).reason,
    "STALE_OR_REPLAYED_TICKET",
  );
});

test("cloned ticket is not accepted", () => {
  const gate = new OfflineVenueReturnGate();
  const ticket = issued(gate);
  assert.equal(
    gate.accept({ ...ticket }, context(), preview(), 1001).reason,
    "STALE_OR_REPLAYED_TICKET",
  );
  assert.equal(
    gate.accept(ticket, context(), preview(), 1001).status,
    "draft_return_mock_only",
  );
});
