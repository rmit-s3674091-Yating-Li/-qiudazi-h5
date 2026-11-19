import test from "node:test";
import assert from "node:assert/strict";
import { OfflineVenueReturnGate } from "../src/core/venue-draft-return.ts";
import { prepareOfflineCourtPreview } from "../src/core/venue-court-draft.ts";

const context = () => ({
  formKey: "create-event-1",
  revision: 2,
  screenEpoch: "mount-17",
  city: "北京",
});
const preview = () =>
  prepareOfflineCourtPreview(
    {
      city: "北京",
      name: "模拟球馆",
      address: "虚构地址",
      source: "mock_poi",
      status: "DRAFT_ONLY",
    },
    "3号场",
  );
const issue = (gate, input = context()) => gate.issue(input, 1000);
const accept = (gate, ticket, input = context()) =>
  gate.accept(ticket, input, preview(), 1001);

// A data-only snapshot must not invoke an attacker-controlled getter.
test("issue rejects getter context without executing it", () => {
  const gate = new OfflineVenueReturnGate();
  const input = context();
  let calls = 0;
  Object.defineProperty(input, "revision", {
    enumerable: true,
    get() {
      ++calls;
      return 2;
    },
  });
  assert.equal(issue(gate, input).reason, "INVALID_CONTEXT");
  assert.equal(calls, 0);
});

test("accept rejects getter context and consumes ticket without invoking getter", () => {
  const gate = new OfflineVenueReturnGate();
  const issued = issue(gate);
  assert.equal(issued.status, "issued_mock_only");
  const input = context();
  let calls = 0;
  Object.defineProperty(input, "screenEpoch", {
    enumerable: true,
    get() {
      ++calls;
      return "mount-17";
    },
  });
  assert.equal(accept(gate, issued.ticket, input).reason, "INVALID_CONTEXT");
  assert.equal(calls, 0);
  assert.equal(accept(gate, issued.ticket).reason, "STALE_OR_REPLAYED_TICKET");
});

test("inherited formKey cannot substitute for own field", () => {
  const gate = new OfflineVenueReturnGate();
  const input = Object.assign(Object.create({ formKey: "create-event-1" }), {
    revision: 2,
    screenEpoch: "mount-17",
    city: "北京",
  });
  assert.equal(issue(gate, input).reason, "INVALID_CONTEXT");
});

test("class instance cannot be treated as plain form context", () => {
  const gate = new OfflineVenueReturnGate();
  class FakeContext {
    constructor() {
      Object.assign(this, context());
    }
  }
  assert.equal(issue(gate, new FakeContext()).reason, "INVALID_CONTEXT");
});

test("non-enumerable required field is not accepted as route context", () => {
  const gate = new OfflineVenueReturnGate();
  const input = context();
  Object.defineProperty(input, "city", {
    value: "北京",
    enumerable: false,
    configurable: true,
  });
  assert.equal(issue(gate, input).reason, "INVALID_CONTEXT");
});

test("throwing proxy reflection trap fails closed", () => {
  const gate = new OfflineVenueReturnGate();
  const input = new Proxy(context(), {
    getOwnPropertyDescriptor() {
      throw new Error("sensitive exception");
    },
  });
  assert.equal(issue(gate, input).reason, "INVALID_CONTEXT");
});

test("null-prototype own-data context is valid", () => {
  const gate = new OfflineVenueReturnGate();
  const input = Object.assign(Object.create(null), context());
  const issued = issue(gate, input);
  assert.equal(issued.status, "issued_mock_only");
  assert.equal(
    accept(gate, issued.ticket, input).status,
    "draft_return_mock_only",
  );
});

test("ordinary frozen own-data context is valid", () => {
  const gate = new OfflineVenueReturnGate();
  const input = Object.freeze(context());
  const issued = issue(gate, input);
  assert.equal(issued.status, "issued_mock_only");
  assert.equal(
    accept(gate, issued.ticket, input).status,
    "draft_return_mock_only",
  );
});

test("extra credential metadata is rejected", () => {
  const gate = new OfflineVenueReturnGate();
  const input = {
    ...context(),
    authUserId: "untrusted",
    access_token: "redacted",
  };
  assert.deepEqual(issue(gate, input), {
    status: "blocked",
    reason: "INVALID_CONTEXT",
  });
  assert.equal(issue(gate, context()).status, "issued_mock_only");
});

test("ticket stores immutable context rather than caller object", () => {
  const gate = new OfflineVenueReturnGate();
  const input = context();
  const issued = issue(gate, input);
  assert.equal(issued.status, "issued_mock_only");
  input.revision = 3;
  assert.equal(issued.ticket.context.revision, 2);
  assert.equal(accept(gate, issued.ticket, input).reason, "FORM_CHANGED");
});
