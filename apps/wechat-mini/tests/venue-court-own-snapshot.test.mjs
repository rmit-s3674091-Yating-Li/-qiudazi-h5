import test from "node:test";
import assert from "node:assert/strict";
import { prepareOfflineCourtPreview } from "../src/core/venue-court-draft.ts";

const venue = () => ({
  city: "北京",
  name: "北京模拟网球场 A",
  address: "北京市·模拟地址 A（非真实场馆）",
  source: "mock_poi",
  status: "DRAFT_ONLY",
});
const blocked = { status: "blocked", reason: "INVALID_VENUE_DRAFT" };

test("plain own-data draft produces detached offline-only preview", () => {
  const input = { ...venue(), auth_user_id: "must-not-copy", latitude: 39.9 };
  const result = prepareOfflineCourtPreview(input, " 3号场 ");
  assert.equal(result.status, "ready_mock_only");
  assert.equal(result.verification, "OFFLINE_MOCK_ONLY");
  assert.equal(result.canPersist, false);
  assert.equal(result.preview.specificCourt, "3号场");
  assert.equal("auth_user_id" in result.preview, false);
  assert.equal("latitude" in result.preview, false);
  input.name = "after";
  assert.equal(result.preview.venueName, "北京模拟网球场 A");
});

test("manual own-data draft and null court remain supported", () => {
  const result = prepareOfflineCourtPreview(
    { ...venue(), source: "manual" },
    " ",
  );
  assert.equal(result.status, "ready_mock_only");
  assert.equal(result.preview.venueSource, "manual");
  assert.equal(result.preview.specificCourt, null);
});

test("inherited venue identity fields are not accepted", () => {
  for (const field of ["city", "name", "address", "source", "status"]) {
    const input = venue();
    const value = input[field];
    delete input[field];
    Object.setPrototypeOf(input, { [field]: value });
    assert.deepEqual(
      prepareOfflineCourtPreview(input, "1号场"),
      blocked,
      field,
    );
  }
});

test("accessor venue identity fields are rejected without invoking getters", () => {
  for (const field of ["city", "name", "address", "source", "status"]) {
    const input = venue();
    let calls = 0;
    Object.defineProperty(input, field, {
      enumerable: true,
      configurable: true,
      get() {
        calls++;
        return venue()[field];
      },
    });
    assert.deepEqual(
      prepareOfflineCourtPreview(input, "1号场"),
      blocked,
      field,
    );
    assert.equal(calls, 0, field);
  }
});

test("non-enumerable required venue fields are rejected", () => {
  for (const field of ["city", "name", "address", "source", "status"]) {
    const input = venue();
    Object.defineProperty(input, field, { enumerable: false });
    assert.deepEqual(
      prepareOfflineCourtPreview(input, "1号场"),
      blocked,
      field,
    );
  }
});

test("null-prototype plain data draft is supported", () => {
  const input = Object.assign(Object.create(null), venue());
  const result = prepareOfflineCourtPreview(input, "1号场");
  assert.equal(result.status, "ready_mock_only");
  assert.equal(result.preview.venueName, "北京模拟网球场 A");
});

test("getter cannot change value between validation and copy", () => {
  const input = venue();
  let calls = 0;
  Object.defineProperty(input, "name", {
    get() {
      return ++calls === 1 ? "通过验证" : "篡改场馆";
    },
  });
  assert.deepEqual(prepareOfflineCourtPreview(input, "1号场"), blocked);
  assert.equal(calls, 0);
});

test("descriptor trap exceptions fail closed", () => {
  const input = new Proxy(venue(), {
    getOwnPropertyDescriptor() {
      throw Error("hostile proxy");
    },
  });
  assert.deepEqual(prepareOfflineCourtPreview(input, "1号场"), blocked);
});

test("own descriptor is read once per allowlisted field", () => {
  const counts = new Map();
  const input = new Proxy(venue(), {
    getOwnPropertyDescriptor(target, key) {
      counts.set(key, (counts.get(key) || 0) + 1);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const result = prepareOfflineCourtPreview(input, "1号场");
  assert.equal(result.status, "ready_mock_only");
  for (const field of ["city", "name", "address", "source", "status"])
    assert.equal(counts.get(field), 1, field);
});

test("missing, undefined, or non-string own fields fail closed", () => {
  for (const field of ["city", "name", "address", "source", "status"]) {
    const input = venue();
    input[field] = undefined;
    assert.deepEqual(prepareOfflineCourtPreview(input, "1号场"), blocked);
  }
});

test("existing text restrictions still reject control and oversized names", () => {
  assert.deepEqual(
    prepareOfflineCourtPreview({ ...venue(), name: "bad\u202e" }, "1号场"),
    blocked,
  );
  assert.deepEqual(
    prepareOfflineCourtPreview(
      { ...venue(), address: "x".repeat(401) },
      "1号场",
    ),
    blocked,
  );
});

test("court validation remains a separate failure reason", () => {
  assert.deepEqual(prepareOfflineCourtPreview(venue(), "x".repeat(81)), {
    status: "blocked",
    reason: "INVALID_COURT_DETAIL",
  });
});
