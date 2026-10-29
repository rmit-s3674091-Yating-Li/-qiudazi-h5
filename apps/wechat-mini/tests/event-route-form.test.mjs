import test from "node:test";
import assert from "node:assert/strict";
import { OfflineEventRouteForm } from "../src/core/event-route-form.ts";
import { OfflineVenueRouteDriver } from "../src/core/venue-route-driver.ts";
import { prepareOfflineCourtPreview } from "../src/core/venue-court-draft.ts";
import { readFileSync } from "node:fs";

const preview = (city = "北京") =>
  prepareOfflineCourtPreview(
    {
      city,
      name: "模拟网球场",
      address: "模拟地址",
      source: "manual",
      status: "DRAFT_ONLY",
    },
    "B区2号场",
  );

function fixture() {
  let driver;
  let openedUrl = "";
  let navigateBackCount = 0;
  const navigator = {
    async navigateTo(url) {
      openedUrl = url;
      const result = driver.claim({ handoff: url.split("?handoff=")[1] }, 1001);
      assert.equal(result.status, "claimed_mock_only");
    },
    async navigateBack() {
      ++navigateBackCount;
    },
  };
  driver = new OfflineVenueRouteDriver(navigator);
  const form = new OfflineEventRouteForm(driver);
  return {
    form,
    driver,
    get openedUrl() {
      return openedUrl;
    },
    get backCount() {
      return navigateBackCount;
    },
  };
}

async function opened(f) {
  assert.equal(f.form.changeCity("北京"), true);
  assert.equal((await f.form.open(1000)).status, "opened_mock_only");
}

test("requires an explicit city and never defaults to Beijing", async () => {
  const f = fixture();
  assert.equal(f.form.snapshot().city, null);
  assert.deepEqual(await f.form.open(1000), {
    status: "blocked",
    reason: "CITY_REQUIRED",
  });
});

test("opens a dedicated child route with a single non-authorizing handoff label", async () => {
  const f = fixture();
  await opened(f);
  assert.match(
    f.openedUrl,
    /^\/pages\/venue-route-poc\/index\?handoff=nav-[1-9][0-9]*$/,
  );
  assert.doesNotMatch(
    f.openedUrl,
    /auth|token|city|name|address|court|session/i,
  );
});

test("returns the six allowlisted fields exactly once after navigateBack", async () => {
  const f = fixture();
  await opened(f);
  const result = await f.driver.finish(f.form.context(), preview(), 1002);
  assert.equal(result.status, "returned_mock_only");
  assert.equal(f.backCount, 1);
  const received = await f.form.receive();
  assert.equal(received.status, "returned_mock_only");
  assert.equal(received.canPersist, false);
  assert.equal(f.form.snapshot().venue.specificCourt, "B区2号场");
  assert.equal((await f.form.receive()).reason, "NO_RETURNED_DRAFT");
});

test("child onUnload after navigateBack resolution cannot erase the pending parent return", async () => {
  const f = fixture();
  await opened(f);
  assert.equal(
    (await f.driver.finish(f.form.context(), preview(), 1002)).status,
    "returned_mock_only",
  );
  f.driver.childUnloaded();
  assert.equal((await f.form.receive()).status, "returned_mock_only");
});

test("manual venue never gains real coordinates or a persistence flag", async () => {
  const f = fixture();
  await opened(f);
  await f.driver.finish(f.form.context(), preview(), 1002);
  await f.form.receive();
  assert.deepEqual(Object.keys(f.form.snapshot().venue).sort(), [
    "city",
    "specificCourt",
    "status",
    "venueAddress",
    "venueName",
    "venueSource",
  ]);
  assert.equal(f.form.snapshot().canPersist, false);
});

test("editing title cancels a pending child return and clears previous venue", async () => {
  const f = fixture();
  await opened(f);
  assert.equal(f.form.editTitle("新赛事"), true);
  assert.equal(
    (await f.driver.finish(f.form.context(), preview(), 1002)).status,
    "blocked",
  );
  assert.equal(f.form.snapshot().venue, null);
});

test("switching city and back never resurrects an old route", async () => {
  const f = fixture();
  await opened(f);
  f.form.changeCity("上海");
  f.form.changeCity("北京");
  assert.equal(
    (await f.driver.finish(f.form.context(), preview(), 1002)).status,
    "blocked",
  );
});

test("parent unload invalidates route and clears draft", async () => {
  const f = fixture();
  await opened(f);
  f.form.unload();
  assert.equal(
    (await f.driver.finish(f.form.context(), preview(), 1002)).status,
    "blocked",
  );
  assert.equal(f.form.snapshot().venue, null);
});

test("invalid city/title edits are rejected without state change", () => {
  const f = fixture();
  assert.equal(f.form.changeCity("杭州"), false);
  assert.equal(f.form.editTitle("bad\u0000name"), false);
  assert.equal(f.form.snapshot().revision, 0);
});

test("parent screen epochs are unique and not encoded in URL", async () => {
  const f = fixture();
  const other = new OfflineEventRouteForm(f.driver);
  f.form.changeCity("北京");
  other.changeCity("北京");
  assert.notEqual(f.form.context().screenEpoch, other.context().screenEpoch);
  await f.form.open(1000);
  assert.doesNotMatch(f.openedUrl, /route-screen/);
});

test("new pages use Taro load/show/unload hooks and no backend", () => {
  const parent = readFileSync(
    new URL("../src/pages/event-route-poc/index.tsx", import.meta.url),
    "utf8",
  );
  const child = readFileSync(
    new URL("../src/pages/venue-route-poc/index.tsx", import.meta.url),
    "utf8",
  );
  const config = readFileSync(
    new URL("../src/app.config.ts", import.meta.url),
    "utf8",
  );
  assert.match(parent, /useDidShow\(/);
  assert.match(parent, /useUnload\(/);
  assert.match(parent, /form\.receive\(/);
  assert.match(child, /useLoad\(/);
  assert.match(child, /useUnload\(/);
  assert.match(child, /offlineVenueRouteDriver\.finish\(/);
  assert.match(config, /pages\/venue-route-poc\/index/);
  assert.doesNotMatch(
    parent + child,
    /supabase\.from\(|wx\.login\(|code2Session|uploadFile\(/,
  );
});
