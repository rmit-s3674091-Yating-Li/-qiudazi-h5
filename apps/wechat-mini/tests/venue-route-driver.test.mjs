import test from "node:test";
import assert from "node:assert/strict";
import { OfflineVenueRouteDriver } from "../src/core/venue-route-driver.ts";
import { prepareOfflineCourtPreview } from "../src/core/venue-court-draft.ts";

const context = (overrides = {}) => ({
  formKey: "event-create-poc",
  revision: 1,
  screenEpoch: "screen-a",
  city: "北京",
  ...overrides,
});
const preview = (overrides = {}) =>
  prepareOfflineCourtPreview(
    {
      city: "北京",
      name: "北京模拟网球场 A",
      address: "北京市模拟地址 A",
      source: "mock_poi",
      status: "DRAFT_ONLY",
      ...overrides,
    },
    "3号场",
  );
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const fakeNavigator = () => {
  const urls = [];
  let backs = 0;
  return {
    urls,
    get backs() {
      return backs;
    },
    navigateTo(url) {
      urls.push(url);
      return Promise.resolve();
    },
    navigateBack() {
      ++backs;
      return Promise.resolve();
    },
  };
};
const options = (url) => ({ handoff: url.split("?handoff=")[1] });
const begin = async (driver, nav, now = 1000) => {
  const opened = await driver.open(context(), now);
  assert.equal(opened.status, "opened_mock_only");
  const claimed = driver.claim(options(nav.urls.at(-1)), now + 1);
  assert.equal(claimed.status, "claimed_mock_only");
  return { opened, claimed };
};

test("actual navigation port receives only an opaque mock route", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  const result = await driver.open(context(), 1000);
  assert.equal(result.status, "opened_mock_only");
  assert.match(
    nav.urls[0],
    /^\/pages\/venue-route-poc\/index\?handoff=nav-[1-9]\d*$/,
  );
  assert.doesNotMatch(nav.urls[0], /北京|screen-a|event-create|token|profile/);
  assert.equal(result.canPersist, false);
});

test("valid claim and return only after navigateBack resolves", async () => {
  const back = deferred();
  const nav = fakeNavigator();
  nav.navigateBack = () => back.promise;
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  let settled = false;
  const pending = driver.finish(context(), preview(), 1002).then((r) => {
    settled = true;
    return r;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  back.resolve();
  const result = await pending;
  assert.equal(result.status, "returned_mock_only");
  assert.equal(result.fields.specificCourt, "3号场");
  assert.equal(result.canPersist, false);
  assert.deepEqual(Object.keys(result.fields).sort(), [
    "city",
    "specificCourt",
    "status",
    "venueAddress",
    "venueName",
    "venueSource",
  ]);
});

test("Taro onLoad can claim before navigateTo promise settles", async () => {
  const open = deferred();
  const nav = fakeNavigator();
  nav.navigateTo = (url) => {
    nav.urls.push(url);
    return open.promise;
  };
  const driver = new OfflineVenueRouteDriver(nav);
  const pending = driver.open(context(), 1000);
  assert.equal(
    driver.claim(options(nav.urls[0]), 1001).status,
    "claimed_mock_only",
  );
  assert.equal(
    (await driver.finish(context(), preview(), 1002)).reason,
    "NAVIGATION_NOT_READY",
  );
  open.resolve();
  assert.equal((await pending).status, "opened_mock_only");
  assert.equal(
    (await driver.finish(context(), preview(), 1003)).status,
    "returned_mock_only",
  );
});

test("simultaneous opens are rejected without extra navigation", async () => {
  const open = deferred();
  const nav = fakeNavigator();
  nav.navigateTo = (url) => {
    nav.urls.push(url);
    return open.promise;
  };
  const driver = new OfflineVenueRouteDriver(nav);
  const first = driver.open(context(), 1000);
  assert.equal((await driver.open(context(), 1001)).reason, "NAVIGATION_BUSY");
  assert.equal(nav.urls.length, 1);
  open.resolve();
  assert.equal((await first).status, "opened_mock_only");
});

test("navigateTo rejection closes transaction and permits fresh retry", async () => {
  const nav = fakeNavigator();
  nav.navigateTo = () =>
    Promise.reject(new Error("sensitive URL should not leak"));
  const driver = new OfflineVenueRouteDriver(nav);
  assert.deepEqual(await driver.open(context(), 1000), {
    status: "blocked",
    reason: "NAVIGATE_TO_FAILED",
  });
  nav.navigateTo = (url) => {
    nav.urls.push(url);
    return Promise.resolve();
  };
  assert.equal((await driver.open(context(), 1001)).status, "opened_mock_only");
});

test("synchronous navigateTo throw is safely classified", async () => {
  const nav = fakeNavigator();
  nav.navigateTo = () => {
    throw new Error("private exception");
  };
  const driver = new OfflineVenueRouteDriver(nav);
  assert.equal(
    (await driver.open(context(), 1000)).reason,
    "NAVIGATE_TO_FAILED",
  );
});

test("non-Promise navigation result fails closed", async () => {
  const nav = fakeNavigator();
  nav.navigateTo = () => undefined;
  const driver = new OfflineVenueRouteDriver(nav);
  assert.equal(
    (await driver.open(context(), 1000)).reason,
    "NAVIGATE_TO_FAILED",
  );
});

test("navigation back rejection does not expose draft", async () => {
  const nav = fakeNavigator();
  nav.navigateBack = () => Promise.reject(new Error("private back failure"));
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  assert.deepEqual(await driver.finish(context(), preview(), 1002), {
    status: "blocked",
    reason: "NAVIGATE_BACK_FAILED",
  });
  assert.equal(
    (await driver.finish(context(), preview(), 1003)).reason,
    "NOT_CLAIMED",
  );
});

test("navigation back non-Promise result is a failure", async () => {
  const nav = fakeNavigator();
  nav.navigateBack = () => undefined;
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  assert.equal(
    (await driver.finish(context(), preview(), 1002)).reason,
    "NAVIGATE_BACK_FAILED",
  );
});

test("child unload during navigateBack is not premature cancellation", async () => {
  const nav = fakeNavigator();
  nav.navigateBack = async () => {
    driver.childUnloaded();
  };
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  assert.equal(
    (await driver.finish(context(), preview(), 1002)).status,
    "returned_mock_only",
  );
});

test("child abandons without finish and route cannot be claimed again", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  driver.childUnloaded();
  assert.equal(
    driver.claim(options(nav.urls[0]), 1002).reason,
    "NAVIGATION_NOT_READY",
  );
  assert.equal(
    (await driver.finish(context(), preview(), 1002)).reason,
    "NOT_CLAIMED",
  );
});

test("parent onHide does not cancel but parent onUnload does", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  assert.equal(
    (await driver.finish(context(), preview(), 1002)).status,
    "returned_mock_only",
  );
  await begin(driver, nav, 2000);
  driver.parentUnloaded();
  assert.equal(
    (await driver.finish(context(), preview(), 2002)).reason,
    "NOT_CLAIMED",
  );
});

test("parent edit rejects stale A→B→A form before return", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  assert.equal(
    (await driver.finish(context({ revision: 3 }), preview(), 1002)).reason,
    "FORM_CHANGED",
  );
  assert.equal(nav.backs, 0);
});

test("parentChanged cancels in-flight route and prevents stale return", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  driver.parentChanged();
  assert.equal(
    (await driver.finish(context(), preview(), 1002)).reason,
    "NOT_CLAIMED",
  );
});

test("late navigateTo rejection cannot cancel a newer route", async () => {
  const first = deferred();
  const nav = fakeNavigator();
  let calls = 0;
  nav.navigateTo = (url) => {
    nav.urls.push(url);
    return ++calls === 1 ? first.promise : Promise.resolve();
  };
  const driver = new OfflineVenueRouteDriver(nav);
  const stale = driver.open(context(), 1000);
  driver.cancel();
  const fresh = await driver.open(context({ revision: 2 }), 2000);
  assert.equal(fresh.status, "opened_mock_only");
  first.reject(new Error("late failure"));
  assert.equal((await stale).reason, "NAVIGATION_CANCELLED");
  assert.equal(
    driver.claim(options(nav.urls[1]), 2001).status,
    "claimed_mock_only",
  );
});

test("late navigateTo success cannot overwrite new transaction", async () => {
  const first = deferred();
  const nav = fakeNavigator();
  let calls = 0;
  nav.navigateTo = (url) => {
    nav.urls.push(url);
    return ++calls === 1 ? first.promise : Promise.resolve();
  };
  const driver = new OfflineVenueRouteDriver(nav);
  const stale = driver.open(context(), 1000);
  driver.cancel();
  assert.equal(
    (await driver.open(context({ revision: 2 }), 2000)).status,
    "opened_mock_only",
  );
  first.resolve();
  assert.equal((await stale).reason, "NAVIGATION_CANCELLED");
  assert.equal(
    driver.claim(options(nav.urls[1]), 2001).status,
    "claimed_mock_only",
  );
});

test("cancel during navigateBack prevents late draft exposure", async () => {
  const back = deferred();
  const nav = fakeNavigator();
  nav.navigateBack = () => back.promise;
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  const pending = driver.finish(context(), preview(), 1002);
  driver.parentUnloaded();
  back.resolve();
  assert.equal((await pending).reason, "NAVIGATION_CANCELLED");
});

test("wrong or injected onLoad parameters fail without consuming valid route", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await driver.open(context(), 1000);
  assert.equal(
    driver.claim({ handoff: "nav-0", auth: "x" }, 1001).reason,
    "INVALID_ROUTE_OPTIONS",
  );
  assert.equal(
    driver.claim(options(nav.urls[0]), 1002).status,
    "claimed_mock_only",
  );
});

test("expired claim invalidates route and prevents finish", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await driver.open(context(), 1000);
  assert.equal(driver.claim(options(nav.urls[0]), 601001).reason, "EXPIRED");
  assert.equal(
    (await driver.finish(context(), preview(), 601002)).reason,
    "NOT_CLAIMED",
  );
});

test("invalid context never invokes navigation", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  assert.equal(
    (await driver.open(context({ city: "杭州" }), 1000)).reason,
    "INVALID_CONTEXT",
  );
  assert.equal(nav.urls.length, 0);
});

test("no session, profile, network, storage or real venue data is accessed", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  const withExtra = { ...preview(), access_token: "secret", profileId: "G" };
  const result = await driver.finish(context(), withExtra, 1002);
  assert.equal(result.status, "returned_mock_only");
  assert.doesNotMatch(
    JSON.stringify(result),
    /access_token|secret|profileId|"G"/,
  );
});

test("parent onShow receives one-shot draft after navigation back", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  await driver.finish(context(), preview(), 1002);
  const first = await driver.receive(context());
  assert.equal(first.status, "returned_mock_only");
  assert.equal(first.fields.specificCourt, "3号场");
  assert.equal((await driver.receive(context())).reason, "NO_RETURNED_DRAFT");
});

test("parent onShow waits for delayed navigateBack before receiving", async () => {
  const back = deferred();
  const nav = fakeNavigator();
  nav.navigateBack = () => back.promise;
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  const finishing = driver.finish(context(), preview(), 1002);
  let received = false;
  const receiving = driver.receive(context()).then((r) => {
    received = true;
    return r;
  });
  await Promise.resolve();
  assert.equal(received, false);
  back.resolve();
  assert.equal((await finishing).status, "returned_mock_only");
  assert.equal((await receiving).status, "returned_mock_only");
});

test("parent receive rechecks changed revision and consumes stale result", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  await driver.finish(context(), preview(), 1002);
  assert.equal(
    (await driver.receive(context({ revision: 3 }))).reason,
    "FORM_CHANGED",
  );
  assert.equal((await driver.receive(context())).reason, "NO_RETURNED_DRAFT");
});

test("parent remount rejects prior draft even after successful back", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  await driver.finish(context(), preview(), 1002);
  assert.equal(
    (await driver.receive(context({ screenEpoch: "screen-b" }))).reason,
    "FORM_CHANGED",
  );
});

test("parent change after back but before receive clears pending result", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  await driver.finish(context(), preview(), 1002);
  driver.parentChanged();
  assert.equal((await driver.receive(context())).reason, "NO_RETURNED_DRAFT");
});

test("back failure has no pending draft to receive", async () => {
  const nav = fakeNavigator();
  nav.navigateBack = () => Promise.reject(new Error("back failed"));
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  assert.equal(
    (await driver.finish(context(), preview(), 1002)).reason,
    "NAVIGATE_BACK_FAILED",
  );
  assert.equal((await driver.receive(context())).reason, "NO_RETURNED_DRAFT");
});

test("new route clears unconsumed prior return", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  await begin(driver, nav);
  await driver.finish(context(), preview(), 1002);
  assert.equal(
    (await driver.open(context({ revision: 2 }), 2000)).status,
    "opened_mock_only",
  );
  assert.equal((await driver.receive(context())).reason, "NO_RETURNED_DRAFT");
});

test("malicious getter in parent context is rejected before navigation", async () => {
  const nav = fakeNavigator();
  const driver = new OfflineVenueRouteDriver(nav);
  const malicious = context();
  Object.defineProperty(malicious, "city", {
    get() {
      throw new Error("secret");
    },
  });
  assert.equal((await driver.open(malicious, 1000)).reason, "INVALID_CONTEXT");
  assert.equal(nav.urls.length, 0);
});
