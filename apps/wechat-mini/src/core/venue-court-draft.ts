/**
 * Offline-only composition of an explicitly confirmed venue and optional court.
 * The court is a separate free-text field; it is NEVER a POI query, coordinate,
 * map marker, or permission to persist an event.
 */
export type CourtDetailValidation =
  | Readonly<{ ok: true; value: string | null }>
  | Readonly<{ ok: false; reason: "INVALID_COURT_DETAIL" }>;

export type OfflineCourtPreviewDecision =
  | Readonly<{
      status: "ready_mock_only";
      verification: "OFFLINE_MOCK_ONLY";
      canPersist: false;
      preview: Readonly<{
        city: "北京" | "上海" | "成都";
        venueName: string;
        venueAddress: string;
        venueSource: "manual" | "mock_poi";
        specificCourt: string | null;
        status: "DRAFT_ONLY";
      }>;
    }>
  | Readonly<{
      status: "blocked";
      reason: "INVALID_VENUE_DRAFT" | "INVALID_COURT_DETAIL";
    }>;

const CITIES = new Set(["北京", "上海", "成都"]);
const INVALID_TEXT =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u;
const UNPAIRED_SURROGATE =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
const plainText = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  value.trim() === value &&
  !INVALID_TEXT.test(value) &&
  !UNPAIRED_SURROGATE.test(value);

/** Blank means "not specified"; invalid content is not silently truncated. */
export function validateSpecificCourt(input: unknown): CourtDetailValidation {
  try {
    if (typeof input !== "string")
      return { ok: false, reason: "INVALID_COURT_DETAIL" };
    const value = input.trim();
    if (!value) return { ok: true, value: null };
    if (!plainText(value, 80))
      return { ok: false, reason: "INVALID_COURT_DETAIL" };
    return { ok: true, value };
  } catch {
    return { ok: false, reason: "INVALID_COURT_DETAIL" };
  }
}

/** Only allowlisted venue fields are copied. No coordinates or actor IDs. */
export function prepareOfflineCourtPreview(
  venueDraft: unknown,
  specificCourt: unknown,
): OfflineCourtPreviewDecision {
  try {
    if (
      venueDraft === null ||
      typeof venueDraft !== "object" ||
      Array.isArray(venueDraft)
    )
      return { status: "blocked", reason: "INVALID_VENUE_DRAFT" };
    const draft = venueDraft as Record<string, unknown>;
    if (
      draft.status !== "DRAFT_ONLY" ||
      !CITIES.has(draft.city as string) ||
      (draft.source !== "manual" && draft.source !== "mock_poi") ||
      !plainText(draft.name, 160) ||
      !plainText(draft.address, 400)
    )
      return { status: "blocked", reason: "INVALID_VENUE_DRAFT" };
    const court = validateSpecificCourt(specificCourt);
    if (!court.ok) return { status: "blocked", reason: court.reason };
    return {
      status: "ready_mock_only",
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
      preview: {
        city: draft.city as "北京" | "上海" | "成都",
        venueName: draft.name,
        venueAddress: draft.address,
        venueSource: draft.source,
        specificCourt: court.value,
        status: "DRAFT_ONLY",
      },
    };
  } catch {
    return { status: "blocked", reason: "INVALID_VENUE_DRAFT" };
  }
}
