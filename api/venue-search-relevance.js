/** A city-valid POI is not necessarily a relevant match for the typed query.
 * Keep the V2 fallback available when V3 returns only unrelated places.
 * Deliberately conservative: false negatives cause a bounded extra V2 lookup;
 * false positives would silently suppress potentially better candidates.
 */
export function hasDirectNameMatch(query, places) {
  const normalized = String(query || "").normalize("NFKC").replace(/[\s·•・()（）\-_/]/g, "").toLowerCase();
  if (!normalized || !Array.isArray(places)) return false;
  return places.some(place =>
    typeof place?.name === "string" &&
    place.name.normalize("NFKC").replace(/[\s·•・()（）\-_/]/g, "").toLowerCase().includes(normalized)
  );
}
