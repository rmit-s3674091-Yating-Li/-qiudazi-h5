import assert from "node:assert/strict";
import test from "node:test";
import { prepareMockWeappMapPoint } from "../src/core/venue-coordinate-contract.ts";

const base = Object.freeze({
  city: "北京",
  latitude: 39.99,
  longitude: 116.39,
  crs: "GCJ02",
  source: "manual_pin",
  placeId: null,
});
const prepare = (overrides = {}, city = "北京", converter) =>
  prepareMockWeappMapPoint({ ...base, ...overrides }, city, converter);
const fake = (input) => ({
  latitude: input.latitude + 0.001,
  longitude: input.longitude + 0.002,
  from: input.from,
  to: input.to,
  adapterId: "offline-test-fixture",
});
const blocked = (result, reason) =>
  assert.deepEqual(result, { status: "blocked", reason });

test("already-GCJ02 mock point passes without conversion and retains provenance", () => {
  const result = prepare();
  assert.equal(result.status, "ready_mock_only");
  assert.equal(result.verification, "OFFLINE_MOCK_ONLY");
  assert.deepEqual(result.point, {
    latitude: 39.99,
    longitude: 116.39,
    crs: "GCJ02",
  });
  assert.equal(result.provenance.originalCrs, "GCJ02");
  assert.equal(result.provenance.conversion, null);
});
test("WGS84 never silently reaches GCJ02 map", () => {
  blocked(
    prepare({ crs: "WGS84", source: "openstreetmap" }),
    "CONVERSION_REQUIRED",
  );
});
test("BD09 never silently reaches GCJ02 map", () => {
  blocked(prepare({ crs: "BD09", source: "baidu" }), "CONVERSION_REQUIRED");
});
test("explicit WGS84 conversion carries trace, still only mock evidence", () => {
  const result = prepare({ crs: "WGS84", source: "device" }, "北京", fake);
  assert.equal(result.status, "ready_mock_only");
  assert.equal(result.point.crs, "GCJ02");
  assert.equal(result.point.latitude, 39.991);
  assert.equal(result.provenance.originalCrs, "WGS84");
  assert.deepEqual(result.provenance.conversion, {
    from: "WGS84",
    to: "GCJ02",
    adapterId: "offline-test-fixture",
  });
});
test("explicit BD09 conversion is permitted only via injected adapter", () => {
  const result = prepare(
    { crs: "BD09", source: "baidu", placeId: "baidu_123" },
    "北京",
    fake,
  );
  assert.equal(result.status, "ready_mock_only");
  assert.equal(result.provenance.placeId, "baidu_123");
  assert.equal(result.provenance.originalCrs, "BD09");
});
test("provider name cannot imply a CRS", () => {
  blocked(
    prepare({ crs: undefined, source: "baidu" }, "北京", fake),
    "INVALID_COORDINATE_INPUT",
  );
});
test("city mismatch is blocked before converter call", () => {
  let calls = 0;
  blocked(
    prepare({ crs: "BD09" }, "上海", () => {
      calls++;
      return fake(base);
    }),
    "CITY_MISMATCH",
  );
  assert.equal(calls, 0);
});
test("blank selected city fails closed", () => {
  blocked(prepare({}, " "), "INVALID_COORDINATE_INPUT");
});
test("non-finite and out-of-range coordinates are rejected", () => {
  for (const coords of [
    { latitude: NaN },
    { latitude: Infinity },
    { longitude: -181 },
    { latitude: 91 },
    { longitude: "116.39" },
    { latitude: "39.99" },
  ])
    blocked(prepare(coords), "INVALID_COORDINATE_INPUT");
});
test("null-island placeholder coordinates are rejected", () => {
  blocked(prepare({ latitude: 0, longitude: 0 }), "INVALID_COORDINATE_INPUT");
});
test("unknown source and CRS are rejected", () => {
  blocked(prepare({ source: "unverified-map" }), "INVALID_COORDINATE_INPUT");
  blocked(prepare({ crs: "EPSG:9999" }), "INVALID_COORDINATE_INPUT");
});
test("previously converted GCJ02 is never converted again", () => {
  let calls = 0;
  const result = prepare(
    {
      crs: "GCJ02",
      source: "openstreetmap",
      previousConversion: {
        from: "WGS84",
        to: "GCJ02",
        adapterId: "verified-adapter",
      },
    },
    "北京",
    () => {
      calls++;
      throw new Error("must not run");
    },
  );
  assert.equal(result.status, "ready_mock_only");
  assert.equal(calls, 0);
  assert.equal(result.provenance.originalCrs, "WGS84");
});
test("history inconsistent with current CRS fails closed", () => {
  blocked(
    prepare(
      {
        crs: "WGS84",
        previousConversion: { from: "BD09", to: "GCJ02", adapterId: "x" },
      },
      "北京",
      fake,
    ),
    "INCONSISTENT_PROVENANCE",
  );
});
test("multi-hop conversion is blocked even with an adapter", () => {
  blocked(
    prepare(
      {
        crs: "WGS84",
        previousConversion: { from: "BD09", to: "WGS84", adapterId: "x" },
      },
      "北京",
      fake,
    ),
    "MULTIPLE_TRANSFORMS_BLOCKED",
  );
});
test("invalid history cannot be used to bypass conversion gate", () => {
  blocked(
    prepare({
      crs: "GCJ02",
      previousConversion: { from: "GCJ02", to: "GCJ02", adapterId: "x" },
    }),
    "INVALID_COORDINATE_INPUT",
  );
});
test("converter target/from mismatch is rejected", () => {
  blocked(
    prepare({ crs: "BD09" }, "北京", (input) => ({
      ...fake(input),
      from: "WGS84",
    })),
    "CONVERSION_FAILED",
  );
  blocked(
    prepare({ crs: "BD09" }, "北京", (input) => ({
      ...fake(input),
      to: "WGS84",
    })),
    "CONVERSION_FAILED",
  );
});
test("converter invalid coordinates and adapter ID are rejected", () => {
  blocked(
    prepare({ crs: "WGS84" }, "北京", (input) => ({
      ...fake(input),
      latitude: NaN,
    })),
    "CONVERSION_FAILED",
  );
  blocked(
    prepare({ crs: "WGS84" }, "北京", (input) => ({
      ...fake(input),
      adapterId: "",
    })),
    "CONVERSION_FAILED",
  );
});
test("converter exceptions fail closed without leaking error details", () => {
  blocked(
    prepare({ crs: "BD09" }, "北京", () => {
      throw new Error("private provider response");
    }),
    "CONVERSION_FAILED",
  );
});
test("malformed object getter fails closed", () => {
  const bad = Object.defineProperty({}, "city", {
    get() {
      throw new Error("getter");
    },
  });
  blocked(prepareMockWeappMapPoint(bad, "北京"), "INVALID_COORDINATE_INPUT");
});
test("invalid place ID and unsupported manual text are not rendered as a point", () => {
  blocked(prepare({ placeId: "?token=secret" }), "INVALID_COORDINATE_INPUT");
  blocked(
    prepare({ latitude: null, longitude: null }),
    "INVALID_COORDINATE_INPUT",
  );
});
test("input and prior conversion records remain unmodified", () => {
  const previousConversion = Object.freeze({
    from: "WGS84",
    to: "GCJ02",
    adapterId: "x",
  });
  const input = Object.freeze({ ...base, previousConversion });
  assert.equal(
    prepareMockWeappMapPoint(input, "北京").status,
    "ready_mock_only",
  );
  assert.equal(input.latitude, 39.99);
  assert.equal(input.previousConversion.to, "GCJ02");
});
