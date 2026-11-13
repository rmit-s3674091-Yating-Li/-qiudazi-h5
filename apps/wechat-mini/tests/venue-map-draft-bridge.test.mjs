import test from "node:test";
import assert from "node:assert/strict";
import { resolveOfflineVenueMapDraft } from "../src/core/venue-map-draft-bridge.ts";
import {
  VenueSelectionPoc,
  OfflineFixtureVenuePort,
} from "../src/core/venue-selection-poc.ts";

const confirmed = (source = "mock_poi", id = "poi-123") => ({
  status: "CONFIRMED",
  city: "北京",
  selected: {
    id: source === "manual" ? "manual-only" : id,
    name: "测试球馆",
    address: "北京测试地址",
  },
  draft: {
    status: "DRAFT_ONLY",
    city: "北京",
    name: "测试球馆",
    address: "北京测试地址",
    source,
  },
});
const observation = (overrides = {}) => ({
  city: "北京",
  latitude: 39.9,
  longitude: 116.4,
  crs: "GCJ02",
  source: "tencent",
  placeId: "poi-123",
  ...overrides,
});
const blocked = (result, reason) => {
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, reason);
};

test("manual draft remains available without coordinates and cannot persist", () => {
  const r = resolveOfflineVenueMapDraft(confirmed("manual"));
  assert.equal(r.status, "draft_only");
  assert.equal(r.canPersist, false);
  assert.equal(r.preview, null);
  assert.equal(r.draft.source, "manual");
});
test("POI draft without coordinates remains draft-only", () => {
  const r = resolveOfflineVenueMapDraft(confirmed());
  assert.equal(r.status, "draft_only");
  assert.equal(r.draft.status, "DRAFT_ONLY");
});
test("confirmed POI with matching provenance allows only mock map preview", () => {
  const r = resolveOfflineVenueMapDraft(confirmed(), observation());
  assert.equal(r.status, "map_preview_mock_only");
  assert.equal(r.verification, "OFFLINE_MOCK_ONLY");
  assert.equal(r.canPersist, false);
  assert.equal(r.preview.point.crs, "GCJ02");
  assert.equal("latitude" in r.draft, false);
});
test("unconfirmed state is blocked", () =>
  blocked(
    resolveOfflineVenueMapDraft({ ...confirmed(), status: "SELECTED" }),
    "UNCONFIRMED_OR_INVALID_DRAFT",
  ));
test("missing selection is blocked", () =>
  blocked(
    resolveOfflineVenueMapDraft({ ...confirmed(), selected: null }),
    "UNCONFIRMED_OR_INVALID_DRAFT",
  ));
test("forged city in draft is blocked", () =>
  blocked(
    resolveOfflineVenueMapDraft({
      ...confirmed(),
      draft: { ...confirmed().draft, city: "上海" },
    }),
    "UNCONFIRMED_OR_INVALID_DRAFT",
  ));
test("unknown city is blocked", () =>
  blocked(
    resolveOfflineVenueMapDraft({ ...confirmed(), city: "广州" }),
    "UNCONFIRMED_OR_INVALID_DRAFT",
  ));
test("selected name mismatch is blocked", () =>
  blocked(
    resolveOfflineVenueMapDraft({
      ...confirmed(),
      selected: { ...confirmed().selected, name: "别的球馆" },
    }),
    "UNCONFIRMED_OR_INVALID_DRAFT",
  ));
test("manual coordinate injection is blocked", () =>
  blocked(
    resolveOfflineVenueMapDraft(confirmed("manual"), observation()),
    "MANUAL_COORDINATE_UNVERIFIED",
  ));
test("fixture coordinates cannot masquerade as provider POI", () =>
  blocked(
    resolveOfflineVenueMapDraft(
      confirmed("mock_poi", "fixture-bj-001"),
      observation({ placeId: "fixture-bj-001" }),
    ),
    "MOCK_FIXTURE_COORDINATE_UNVERIFIED",
  ));
test("mismatched placeId is blocked", () =>
  blocked(
    resolveOfflineVenueMapDraft(
      confirmed(),
      observation({ placeId: "poi-other" }),
    ),
    "PLACE_ID_MISMATCH",
  ));
test("missing placeId is blocked", () =>
  blocked(
    resolveOfflineVenueMapDraft(confirmed(), observation({ placeId: null })),
    "PLACE_ID_MISMATCH",
  ));
test("device coordinates cannot impersonate selected POI", () =>
  blocked(
    resolveOfflineVenueMapDraft(confirmed(), observation({ source: "device" })),
    "UNTRUSTED_COORDINATE_SOURCE",
  ));
test("city mismatch from coordinate gate is propagated", () => {
  const r = resolveOfflineVenueMapDraft(
    confirmed(),
    observation({ city: "上海" }),
  );
  blocked(r, "COORDINATE_BLOCKED");
  assert.equal(r.coordinateReason, "CITY_MISMATCH");
});
test("BD09 without converter fails closed", () => {
  const r = resolveOfflineVenueMapDraft(
    confirmed(),
    observation({ crs: "BD09" }),
  );
  blocked(r, "COORDINATE_BLOCKED");
  assert.equal(r.coordinateReason, "CONVERSION_REQUIRED");
});
test("converter is called once and never persists coordinates", () => {
  let calls = 0;
  const r = resolveOfflineVenueMapDraft(
    confirmed(),
    observation({ crs: "BD09" }),
    (input) => {
      calls++;
      assert.equal(input.from, "BD09");
      return {
        latitude: 39.8,
        longitude: 116.3,
        from: "BD09",
        to: "GCJ02",
        adapterId: "fake-test",
      };
    },
  );
  assert.equal(calls, 1);
  assert.equal(r.status, "map_preview_mock_only");
  assert.equal(r.preview.provenance.conversion.adapterId, "fake-test");
  assert.equal(r.canPersist, false);
});
test("preconverted coordinate is not converted twice", () => {
  let calls = 0;
  const r = resolveOfflineVenueMapDraft(
    confirmed(),
    observation({
      previousConversion: {
        from: "BD09",
        to: "GCJ02",
        adapterId: "test-adapter",
      },
    }),
    () => {
      calls++;
      throw new Error("must not convert");
    },
  );
  assert.equal(r.status, "map_preview_mock_only");
  assert.equal(calls, 0);
});
test("malicious getters fail closed", () => {
  const snapshot = {
    ...confirmed(),
    get draft() {
      throw new Error("getter");
    },
  };
  blocked(
    resolveOfflineVenueMapDraft(snapshot, observation()),
    "UNCONFIRMED_OR_INVALID_DRAFT",
  );
});
test("output draft is a defensive copy", () => {
  const input = confirmed();
  const r = resolveOfflineVenueMapDraft(input);
  input.draft.name = "篡改";
  assert.equal(r.draft.name, "测试球馆");
});
test("invalid coordinate never yields a marker", () => {
  const r = resolveOfflineVenueMapDraft(
    confirmed(),
    observation({ latitude: Number.NaN }),
  );
  blocked(r, "COORDINATE_BLOCKED");
  assert.equal(r.coordinateReason, "INVALID_COORDINATE_INPUT");
});
test("manual identity must use manual-only sentinel", () => {
  const r = resolveOfflineVenueMapDraft({
    ...confirmed("manual"),
    selected: { ...confirmed("manual").selected, id: "poi-123" },
  });
  blocked(r, "UNCONFIRMED_OR_INVALID_DRAFT");
});

test("real batch32 manual confirm integrates without coordinates", () => {
  const poc = new VenueSelectionPoc(new OfflineFixtureVenuePort());
  assert.equal(poc.useManual("测试球馆", "北京测试地址"), true);
  assert.equal(poc.confirm()?.status, "DRAFT_ONLY");
  const r = resolveOfflineVenueMapDraft(poc.snapshot());
  assert.equal(r.status, "draft_only");
});
test("real batch32 fixture selection cannot gain fabricated map coordinates", async () => {
  const poc = new VenueSelectionPoc(new OfflineFixtureVenuePort());
  const searched = await poc.search("模拟");
  assert.equal(searched.status, "RESULTS");
  assert.equal(poc.chooseCandidate("fixture-bj-001"), true);
  assert.equal(poc.confirm()?.status, "DRAFT_ONLY");
  const r = resolveOfflineVenueMapDraft(
    poc.snapshot(),
    observation({ placeId: "fixture-bj-001" }),
  );
  blocked(r, "MOCK_FIXTURE_COORDINATE_UNVERIFIED");
});
