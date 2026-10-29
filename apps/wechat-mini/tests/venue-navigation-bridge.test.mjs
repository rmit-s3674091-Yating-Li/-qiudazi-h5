import test from "node:test";
import assert from "node:assert/strict";
import { OfflineVenueNavigationBridge } from "../src/core/venue-navigation-bridge.ts";
import { prepareOfflineCourtPreview } from "../src/core/venue-court-draft.ts";

const context = (extra = {}) => ({
  formKey: "event-create-poc",
  revision: 2,
  screenEpoch: "mount-1",
  city: "北京",
  ...extra,
});
const preview = (extra = {}) =>
  prepareOfflineCourtPreview(
    {
      city: "北京",
      name: "北京模拟网球场 A",
      address: "北京市模拟地址A",
      source: "mock_poi",
      status: "DRAFT_ONLY",
      ...extra,
    },
    "3号场",
  );
const optionsFrom = (issued) => ({ handoff: issued.url.split("?handoff=")[1] });
const begin = (bridge, now = 1000) => {
  const issued = bridge.issue(context(), now);
  assert.equal(issued.status, "route_mock_only");
  const claimed = bridge.claim(optionsFrom(issued), now + 1);
  assert.equal(claimed.status, "claimed_mock_only");
  return { issued, claimed };
};

test("route includes only correlation label, not venue, actor or city", () => {
  const b = new OfflineVenueNavigationBridge();
  const r = b.issue({ ...context(), authUserId: "sensitive-user" }, 1000);
  assert.match(
    r.url,
    /^\/pages\/venue-route-poc\/index\?handoff=nav-[1-9][0-9]*$/,
  );
  assert.doesNotMatch(r.url, /北京|sensitive|event-create|mount/);
  assert.equal(r.canPersist, false);
});

test("claim exposes only city and in-memory handle", () => {
  const b = new OfflineVenueNavigationBridge();
  const { claimed } = begin(b);
  assert.equal(claimed.city, "北京");
  assert.deepEqual(Object.keys(claimed).sort(), [
    "canPersist",
    "city",
    "handle",
    "status",
    "verification",
  ]);
  assert.deepEqual(Object.keys(claimed.handle), ["kind"]);
});

test("valid two-stage flow returns only six allowlisted draft fields", () => {
  const b = new OfflineVenueNavigationBridge();
  const { claimed } = begin(b);
  const r = b.finish(claimed.handle, context(), preview(), 1002);
  assert.equal(r.status, "draft_return_mock_only");
  assert.equal(r.fields.specificCourt, "3号场");
  assert.deepEqual(Object.keys(r.fields).sort(), [
    "city",
    "specificCourt",
    "status",
    "venueAddress",
    "venueName",
    "venueSource",
  ]);
  assert.equal(r.canPersist, false);
  assert.equal(r.verification, "OFFLINE_MOCK_ONLY");
});

test("double claim is rejected", () => {
  const b = new OfflineVenueNavigationBridge();
  const { issued } = begin(b);
  assert.equal(b.claim(optionsFrom(issued), 1002).reason, "ALREADY_CLAIMED");
});

test("repeated finish is rejected", () => {
  const b = new OfflineVenueNavigationBridge();
  const { claimed } = begin(b);
  assert.equal(
    b.finish(claimed.handle, context(), preview(), 1002).status,
    "draft_return_mock_only",
  );
  assert.equal(
    b.finish(claimed.handle, context(), preview(), 1003).reason,
    "INVALID_CLAIM",
  );
});

test("cancel before claim blocks stale route", () => {
  const b = new OfflineVenueNavigationBridge();
  const issued = b.issue(context(), 1000);
  b.cancel();
  assert.equal(b.claim(optionsFrom(issued), 1001).reason, "NO_ACTIVE_ROUTE");
});

test("cancel after claim blocks stale return", () => {
  const b = new OfflineVenueNavigationBridge();
  const { claimed } = begin(b);
  b.cancel();
  assert.equal(
    b.finish(claimed.handle, context(), preview(), 1002).reason,
    "INVALID_CLAIM",
  );
});

test("issue new route invalidates prior route and handle", () => {
  const b = new OfflineVenueNavigationBridge();
  const { issued, claimed } = begin(b);
  const second = b.issue(context({ revision: 3 }), 2000);
  assert.equal(b.claim(optionsFrom(issued), 2001).reason, "ROUTE_MISMATCH");
  assert.equal(
    b.finish(claimed.handle, context(), preview(), 2001).reason,
    "INVALID_CLAIM",
  );
  assert.equal(b.claim(optionsFrom(second), 2001).status, "claimed_mock_only");
});

test("no active route after app reload/new channel", () => {
  const old = new OfflineVenueNavigationBridge();
  const issued = old.issue(context(), 1000);
  assert.equal(
    new OfflineVenueNavigationBridge().claim(optionsFrom(issued), 1001).reason,
    "NO_ACTIVE_ROUTE",
  );
});

test("route query injection is rejected without consuming valid route", () => {
  const b = new OfflineVenueNavigationBridge();
  const issued = b.issue(context(), 1000);
  const o = optionsFrom(issued);
  assert.equal(
    b.claim({ ...o, city: "上海" }, 1001).reason,
    "INVALID_ROUTE_OPTIONS",
  );
  assert.equal(b.claim(o, 1002).status, "claimed_mock_only");
});

test("non-string and malformed route labels are rejected", () => {
  const b = new OfflineVenueNavigationBridge();
  b.issue(context(), 1000);
  for (const bad of [
    null,
    [],
    {},
    { handoff: 1 },
    { handoff: "nav-0" },
    { handoff: "nav-1#x" },
    { handoff: "nav-1%2f" },
  ]) {
    assert.equal(b.claim(bad, 1001).reason, "INVALID_ROUTE_OPTIONS");
  }
});

test("inherited and accessor route parameters are rejected", () => {
  const b = new OfflineVenueNavigationBridge();
  b.issue(context(), 1000);
  assert.equal(
    b.claim(Object.create({ handoff: "nav-1" }), 1001).reason,
    "INVALID_ROUTE_OPTIONS",
  );
  const getter = {};
  Object.defineProperty(getter, "handoff", {
    enumerable: true,
    get: () => "nav-1",
  });
  assert.equal(b.claim(getter, 1001).reason, "INVALID_ROUTE_OPTIONS");
});

test("route label mismatch does not leak context", () => {
  const b = new OfflineVenueNavigationBridge();
  b.issue(context(), 1000);
  assert.deepEqual(b.claim({ handoff: "nav-999999" }, 1001), {
    status: "blocked",
    reason: "ROUTE_MISMATCH",
  });
});

test("expired claim fails closed and invalidates", () => {
  const b = new OfflineVenueNavigationBridge();
  const issued = b.issue(context(), 1000);
  assert.equal(b.claim(optionsFrom(issued), 601001).reason, "EXPIRED");
  assert.equal(b.claim(optionsFrom(issued), 601002).reason, "NO_ACTIVE_ROUTE");
});

test("exact TTL boundary is allowed", () => {
  const b = new OfflineVenueNavigationBridge();
  const issued = b.issue(context(), 1000);
  assert.equal(
    b.claim(optionsFrom(issued), 601000).status,
    "claimed_mock_only",
  );
});

test("invalid and rollback clock cancel route", () => {
  for (const clock of [-1, NaN, Infinity, "1001", 999]) {
    const b = new OfflineVenueNavigationBridge();
    const issued = b.issue(context(), 1000);
    assert.equal(b.claim(optionsFrom(issued), clock).reason, "INVALID_CLOCK");
    assert.equal(b.claim(optionsFrom(issued), 1001).reason, "NO_ACTIVE_ROUTE");
  }
});

test("A-B-A city with revised parent form is rejected", () => {
  const b = new OfflineVenueNavigationBridge();
  const { claimed } = begin(b);
  const result = b.finish(
    claimed.handle,
    context({ revision: 4 }),
    preview(),
    1002,
  );
  assert.equal(result.reason, "FORM_CHANGED");
});

test("parent screen remount invalidates old ticket", () => {
  const b = new OfflineVenueNavigationBridge();
  const { claimed } = begin(b);
  assert.equal(
    b.finish(
      claimed.handle,
      context({ screenEpoch: "mount-2" }),
      preview(),
      1002,
    ).reason,
    "FORM_CHANGED",
  );
});

test("city mismatch rejects preview", () => {
  const b = new OfflineVenueNavigationBridge();
  const { claimed } = begin(b);
  assert.equal(
    b.finish(claimed.handle, context(), preview({ city: "上海" }), 1002).reason,
    "CITY_MISMATCH",
  );
});

test("malformed preview consumes claim and cannot be retried", () => {
  const b = new OfflineVenueNavigationBridge();
  const { claimed } = begin(b);
  assert.equal(
    b.finish(
      claimed.handle,
      context(),
      { status: "ready_mock_only", canPersist: true },
      1002,
    ).reason,
    "INVALID_PREVIEW",
  );
  assert.equal(
    b.finish(claimed.handle, context(), preview(), 1003).reason,
    "INVALID_CLAIM",
  );
});

test("forged handle cannot complete and does not consume real claim", () => {
  const b = new OfflineVenueNavigationBridge();
  const { claimed } = begin(b);
  assert.equal(
    b.finish({ kind: "offline-venue-claim" }, context(), preview(), 1002)
      .reason,
    "INVALID_CLAIM",
  );
  assert.equal(
    b.finish(claimed.handle, context(), preview(), 1003).status,
    "draft_return_mock_only",
  );
});

test("finish expired or rollback clock is blocked by underlying one-shot gate", () => {
  for (const now of [999, 601001]) {
    const b = new OfflineVenueNavigationBridge();
    const { claimed } = begin(b);
    const result = b.finish(claimed.handle, context(), preview(), now);
    assert.equal(result.reason, now === 999 ? "INVALID_CLOCK" : "EXPIRED");
    assert.equal(
      b.finish(claimed.handle, context(), preview(), 1002).reason,
      "INVALID_CLAIM",
    );
  }
});

test("invalid context/clock cannot issue a route", () => {
  const b = new OfflineVenueNavigationBridge();
  assert.equal(
    b.issue(context({ city: null }), 1000).reason,
    "INVALID_CONTEXT",
  );
  assert.equal(b.issue(context(), NaN).reason, "INVALID_CLOCK");
});

test("only offline draft is returned; injected credential fields are dropped", () => {
  const b = new OfflineVenueNavigationBridge();
  const { claimed } = begin(b);
  const p = preview();
  const r = b.finish(
    claimed.handle,
    context(),
    {
      ...p,
      access_token: "not-real",
      preview: { ...p.preview, actorId: "hidden", lat: 1 },
    },
    1002,
  );
  assert.equal(r.status, "draft_return_mock_only");
  assert.equal("actorId" in r.fields, false);
  assert.equal("lat" in r.fields, false);
  assert.equal("access_token" in r.fields, false);
});
