import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareOfflineCourtPreview,
  validateSpecificCourt,
} from "../src/core/venue-court-draft.ts";

const venue = (extra = {}) => ({
  city: "北京",
  name: "北京模拟网球场 A",
  address: "北京市·模拟地址 A（非真实场馆）",
  source: "mock_poi",
  status: "DRAFT_ONLY",
  ...extra,
});

test("specific court is optional and not silently inferred", () => {
  assert.deepEqual(validateSpecificCourt("   "), { ok: true, value: null });
  assert.equal(
    prepareOfflineCourtPreview(venue(), "").preview.specificCourt,
    null,
  );
});

test("court text is trimmed without modifying venue name/address", () => {
  const result = prepareOfflineCourtPreview(venue(), "  3号场  ");
  assert.equal(result.status, "ready_mock_only");
  assert.equal(result.preview.specificCourt, "3号场");
  assert.equal(result.preview.venueName, venue().name);
});

test("court remains separate from venue and POI identifiers", () => {
  const result = prepareOfflineCourtPreview(
    venue({ id: "secret", latitude: 39.9, auth_user_id: "x" }),
    "B区2号场",
  );
  assert.deepEqual(Object.keys(result.preview).sort(), [
    "city",
    "specificCourt",
    "status",
    "venueAddress",
    "venueName",
    "venueSource",
  ]);
  assert.equal(result.canPersist, false);
  assert.equal(result.verification, "OFFLINE_MOCK_ONLY");
});

test("manual venue works without map or coordinates", () => {
  const result = prepareOfflineCourtPreview(
    venue({ source: "manual" }),
    "东侧1号场",
  );
  assert.equal(result.status, "ready_mock_only");
  assert.equal(result.preview.venueSource, "manual");
});

test("rejects non-string court input", () => {
  for (const value of [null, undefined, 0, {}, [], true]) {
    assert.equal(validateSpecificCourt(value).ok, false);
    assert.equal(prepareOfflineCourtPreview(venue(), value).status, "blocked");
  }
});

test("rejects oversized court text, does not truncate", () => {
  const result = prepareOfflineCourtPreview(venue(), "a".repeat(81));
  assert.deepEqual(result, {
    status: "blocked",
    reason: "INVALID_COURT_DETAIL",
  });
});

test("rejects control, invisible and bidi override characters", () => {
  for (const value of [
    "1\n2",
    "1\u00002",
    "1\u200b2",
    "1\u202e2",
    "1\u20662",
    "1\ufeff2",
  ]) {
    assert.equal(validateSpecificCourt(value).ok, false);
  }
});

test("rejects unpaired surrogates and allows ordinary emoji", () => {
  assert.equal(validateSpecificCourt("1\ud800").ok, false);
  assert.equal(validateSpecificCourt("1\udc00").ok, false);
  assert.equal(validateSpecificCourt("🎾 1号场").ok, true);
});

test("rejects unconfirmed or unknown-city venue", () => {
  for (const draft of [
    venue({ status: "SELECTED" }),
    venue({ city: "杭州" }),
    venue({ source: "real_verified" }),
  ]) {
    assert.deepEqual(prepareOfflineCourtPreview(draft, "2号场"), {
      status: "blocked",
      reason: "INVALID_VENUE_DRAFT",
    });
  }
});

test("rejects malformed venue names and addresses", () => {
  for (const draft of [
    venue({ name: "" }),
    venue({ name: "A\nB" }),
    venue({ address: "" }),
    venue({ address: "a".repeat(401) }),
  ]) {
    assert.equal(prepareOfflineCourtPreview(draft, "2号场").status, "blocked");
  }
});

test("hostile getter fails closed", () => {
  const malicious = {
    ...venue(),
    get name() {
      throw Error("private secret");
    },
  };
  assert.deepEqual(prepareOfflineCourtPreview(malicious, "2号场"), {
    status: "blocked",
    reason: "INVALID_VENUE_DRAFT",
  });
});

test("input mutation cannot alter the returned preview", () => {
  const draft = venue();
  const result = prepareOfflineCourtPreview(draft, "3号场");
  draft.name = "changed";
  assert.equal(result.preview.venueName, "北京模拟网球场 A");
});

test("blocked court never yields a preview", () => {
  const result = prepareOfflineCourtPreview(venue(), "\u202e");
  assert.equal(result.status, "blocked");
  assert.equal("preview" in result, false);
});

// UI wiring contract: the optional court is never used as the POI query.
test("offline venue page validates court before one-shot confirm", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(
    new URL("../src/pages/venue-poc/index.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    page.indexOf("validateSpecificCourt(specificCourt)") <
      page.indexOf("const venue = poc.confirm()"),
  );
  assert.match(page, /prepareOfflineCourtPreview\(venue, validated\.value/);
  assert.match(page, /具体场地（可选，不参与场馆\/POI 搜索）/);
  assert.match(page, /canPersist|禁止持久化/);
  assert.doesNotMatch(
    page,
    /wx\.login\(|uploadFile\(|fetch\(|service_role|AppSecret/,
  );
});

test("changing venue, city, search or service clears the court preview", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(
    new URL("../src/pages/venue-poc/index.tsx", import.meta.url),
    "utf8",
  );
  for (const marker of [
    'setManualAddress("");\n    resetCourt();',
    "const search = async () => {\n    resetCourt();",
    "const choose = (id: string) => {\n    resetCourt();",
    "if (ok) resetCourt();",
    "setOfflineMode(next);\n    resetCourt();",
  ])
    assert.ok(page.includes(marker), `missing court reset: ${marker}`);
});
