import test from "node:test";
import assert from "node:assert/strict";
import { OfflineEventRouteForm } from "../src/core/event-route-form.ts";
import { OfflineVenueRouteDriver } from "../src/core/venue-route-driver.ts";
import { prepareOfflineCourtPreview } from "../src/core/venue-court-draft.ts";

const preview = () =>
  prepareOfflineCourtPreview(
    {
      city: "北京",
      name: "模拟网球馆",
      address: "模拟地址",
      source: "manual",
      status: "DRAFT_ONLY",
    },
    "3号场",
  );

function fixture() {
  let driver;
  let navigationCount = 0;
  const navigator = {
    async navigateTo(url) {
      ++navigationCount;
      const label = url.split("?handoff=")[1];
      assert.equal(
        driver.claim({ handoff: label }, 1001).status,
        "claimed_mock_only",
      );
    },
    async navigateBack() {},
  };
  driver = new OfflineVenueRouteDriver(navigator);
  const form = new OfflineEventRouteForm(driver);
  return {
    form,
    driver,
    get navigationCount() {
      return navigationCount;
    },
  };
}

async function ready() {
  const f = fixture();
  assert.equal(f.form.changeCity("北京"), true);
  assert.equal((await f.form.open(1000)).status, "opened_mock_only");
  assert.equal(
    (await f.driver.finish(f.form.context(), preview(), 1002)).status,
    "returned_mock_only",
  );
  return f;
}

test("post-await title edit cannot resurrect an already returned venue", async () => {
  const f = await ready();
  const pending = f.form.receive();
  assert.equal(f.form.editTitle("新赛事"), true);
  assert.deepEqual(await pending, {
    status: "blocked",
    reason: "FORM_CHANGED",
  });
  assert.equal(f.form.snapshot().venue, null);
});

test("post-await city A→B→A cannot restore a stale venue", async () => {
  const f = await ready();
  const pending = f.form.receive();
  f.form.changeCity("上海");
  f.form.changeCity("北京");
  assert.deepEqual(await pending, {
    status: "blocked",
    reason: "FORM_CHANGED",
  });
  assert.equal(f.form.snapshot().venue, null);
});

test("post-await parent unload cannot revive draft in a disposed form", async () => {
  const f = await ready();
  const pending = f.form.receive();
  f.form.unload();
  assert.deepEqual(await pending, {
    status: "blocked",
    reason: "FORM_CHANGED",
  });
  assert.equal(f.form.snapshot().venue, null);
});

test("unloaded parent cannot open a new route or expose a live context", async () => {
  const f = fixture();
  f.form.changeCity("北京");
  f.form.unload();
  assert.equal(f.form.context(), null);
  assert.deepEqual(await f.form.open(1000), {
    status: "blocked",
    reason: "PARENT_UNLOADED",
  });
  assert.equal(f.navigationCount, 0);
});

test("unloaded parent rejects later edits and receives", async () => {
  const f = fixture();
  f.form.changeCity("北京");
  const before = f.form.snapshot();
  f.form.unload();
  assert.equal(f.form.changeCity("上海"), false);
  assert.equal(f.form.editTitle("迟到输入"), false);
  assert.deepEqual(await f.form.receive(), {
    status: "blocked",
    reason: "PARENT_UNLOADED",
  });
  assert.equal(f.form.snapshot().city, before.city);
  assert.equal(f.form.snapshot().revision, before.revision);
});

test("invalid title edit does not falsely invalidate a valid return", async () => {
  const f = await ready();
  const pending = f.form.receive();
  assert.equal(f.form.editTitle("bad\u0000title"), false);
  assert.equal((await pending).status, "returned_mock_only");
  assert.equal(f.form.snapshot().venue.specificCourt, "3号场");
});

test("unchanged parent consumes return exactly once", async () => {
  const f = await ready();
  assert.equal((await f.form.receive()).status, "returned_mock_only");
  assert.equal((await f.form.receive()).reason, "NO_RETURNED_DRAFT");
  assert.equal(f.form.snapshot().canPersist, false);
});

test("concurrent parent receives never duplicate the one-shot result", async () => {
  const f = await ready();
  const [a, b] = await Promise.all([f.form.receive(), f.form.receive()]);
  assert.deepEqual([a.status, b.status].sort(), [
    "blocked",
    "returned_mock_only",
  ]);
  assert.equal(f.form.snapshot().venue.venueName, "模拟网球馆");
});

test("changing parent before receive still rejects the old draft", async () => {
  const f = await ready();
  f.form.editTitle("已修改");
  assert.equal((await f.form.receive()).reason, "NO_RETURNED_DRAFT");
  assert.equal(f.form.snapshot().venue, null);
});

test("all successful decisions remain mock-only with no event persistence", async () => {
  const f = await ready();
  const result = await f.form.receive();
  assert.equal(result.status, "returned_mock_only");
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
});
