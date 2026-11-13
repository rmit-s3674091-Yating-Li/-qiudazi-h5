import type { VenuePocSnapshot, VenueDraft } from "./venue-selection-poc.ts";
import {
  prepareMockWeappMapPoint,
  type CoordinateConverter,
  type MapCoordinateDecision,
} from "./venue-coordinate-contract.ts";

/** No event mutation or real POI verification occurs in this offline bridge. */
type SafeDraft = Readonly<
  Pick<VenueDraft, "city" | "name" | "address" | "source" | "status">
>;
type Preview = Extract<MapCoordinateDecision, { status: "ready_mock_only" }>;

export type VenueMapDraftDecision =
  | Readonly<{
      status: "draft_only";
      verification: "OFFLINE_MOCK_ONLY";
      canPersist: false;
      draft: SafeDraft;
      preview: null;
    }>
  | Readonly<{
      status: "map_preview_mock_only";
      verification: "OFFLINE_MOCK_ONLY";
      canPersist: false;
      draft: SafeDraft;
      preview: Readonly<{
        point: Preview["point"];
        provenance: Preview["provenance"];
      }>;
    }>
  | Readonly<{
      status: "blocked";
      reason:
        | "UNCONFIRMED_OR_INVALID_DRAFT"
        | "MANUAL_COORDINATE_UNVERIFIED"
        | "MOCK_FIXTURE_COORDINATE_UNVERIFIED"
        | "PLACE_ID_MISMATCH"
        | "UNTRUSTED_COORDINATE_SOURCE"
        | "COORDINATE_BLOCKED";
      coordinateReason?: Extract<
        MapCoordinateDecision,
        { status: "blocked" }
      >["reason"];
    }>;

const cities = new Set(["北京", "上海", "成都"]);
const providers = new Set(["baidu", "tencent", "amap", "openstreetmap"]);
const safeText = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  value.trim() === value &&
  !/[\u0000-\u001f\u007f]/.test(value);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Bridge batch 32's confirmed offline venue to batch 33's coordinate provenance.
 * No unverified coordinate is ever added to the event-creation draft.
 * The optional marker is a *mock preview only*, not a trusted geocode.
 */
export function resolveOfflineVenueMapDraft(
  snapshot: unknown,
  observation?: unknown,
  converter?: CoordinateConverter,
): VenueMapDraftDecision {
  try {
    if (
      !record(snapshot) ||
      snapshot.status !== "CONFIRMED" ||
      !record(snapshot.draft) ||
      !record(snapshot.selected) ||
      !cities.has(snapshot.city as string)
    ) {
      return { status: "blocked", reason: "UNCONFIRMED_OR_INVALID_DRAFT" };
    }
    const draft = snapshot.draft;
    const selected = snapshot.selected;
    if (
      draft.status !== "DRAFT_ONLY" ||
      draft.city !== snapshot.city ||
      (draft.source !== "manual" && draft.source !== "mock_poi") ||
      !safeText(draft.name, 80) ||
      !safeText(draft.address, 160) ||
      !safeText(selected.id, 160) ||
      selected.name !== draft.name ||
      selected.address !== draft.address ||
      (draft.source === "manual") !== (selected.id === "manual-only")
    ) {
      return { status: "blocked", reason: "UNCONFIRMED_OR_INVALID_DRAFT" };
    }
    const safeDraft: SafeDraft = {
      city: draft.city as VenueDraft["city"],
      name: draft.name,
      address: draft.address,
      source: draft.source,
      status: "DRAFT_ONLY",
    };
    if (observation === undefined || observation === null) {
      return {
        status: "draft_only",
        verification: "OFFLINE_MOCK_ONLY",
        canPersist: false,
        draft: safeDraft,
        preview: null,
      };
    }
    if (draft.source === "manual") {
      return { status: "blocked", reason: "MANUAL_COORDINATE_UNVERIFIED" };
    }
    // Batch 32's fixture IDs are synthetic. Never attach purported real coordinates.
    if (selected.id.startsWith("fixture-")) {
      return {
        status: "blocked",
        reason: "MOCK_FIXTURE_COORDINATE_UNVERIFIED",
      };
    }
    if (!record(observation) || observation.placeId !== selected.id) {
      return { status: "blocked", reason: "PLACE_ID_MISMATCH" };
    }
    if (!providers.has(observation.source as string)) {
      return { status: "blocked", reason: "UNTRUSTED_COORDINATE_SOURCE" };
    }
    const point = prepareMockWeappMapPoint(
      observation,
      snapshot.city as string,
      converter,
    );
    if (point.status === "blocked") {
      return {
        status: "blocked",
        reason: "COORDINATE_BLOCKED",
        coordinateReason: point.reason,
      };
    }
    return {
      status: "map_preview_mock_only",
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
      draft: safeDraft,
      preview: {
        point: { ...point.point },
        provenance: {
          ...point.provenance,
          conversion: point.provenance.conversion
            ? { ...point.provenance.conversion }
            : null,
        },
      },
    };
  } catch {
    return { status: "blocked", reason: "UNCONFIRMED_OR_INVALID_DRAFT" };
  }
}
