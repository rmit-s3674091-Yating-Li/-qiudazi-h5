/** A city-valid POI is not necessarily a relevant match for the typed query.
 * Keep the V2 fallback available when V3 returns only unrelated places.
 * Deliberately conservative: false negatives cause a bounded extra V2 lookup;
 * false positives would silently suppress potentially better candidates.
 */
/** Strictly bounded semantic name recovery for independently denied Baidu endpoints.
 * Handles inserted proper-name qualifiers: 旗忠网球中心 -> 上海旗忠森林体育城网球中心.
 * Only use after the provider returned a city-valid POI and a different endpoint failed.
 * This does NOT replace ordinary ranking, city checks, or a real API recall test.
 */
export function hasSafeNameSequenceMatch(query, places) {
  const norm = (value) =>
    String(value || "")
      .normalize("NFKC")
      .replace(/[\s·•・()（）\-_/]/g, "")
      .toLowerCase();
  const typed = norm(query);
  if (typed.length < 4 || !Array.isArray(places)) return false;
  const typeHints = [
    "网球",
    "公园",
    "地铁",
    "体育",
    "酒店",
    "学校",
    "大学",
    "小区",
    "地标",
    "苑",
  ];
  const requiredTypes = typeHints.filter((type) => typed.includes(type));
  const genericBigrams = new Set([
    "中心",
    "体育",
    "运动",
    "公园",
    "森林",
    "地铁",
    "网球",
    "学校",
    "大学",
    "国际",
    "城市",
  ]);
  const distinctiveBigrams = Array.from({ length: typed.length - 1 }, (_, i) =>
    typed.slice(i, i + 2),
  ).filter((pair) => !genericBigrams.has(pair));
  if (!distinctiveBigrams.length) return false;
  return places.some((place) => {
    if (typeof place?.name !== "string") return false;
    const name = norm(place.name);
    if (name.length < typed.length || name.length > typed.length * 3 + 10)
      return false;
    // A matching parent name followed by extra words is a child POI, not proof of the parent.
    if (name.includes(typed) && !name.endsWith(typed)) return false;
    if (
      requiredTypes.length &&
      !requiredTypes.some((type) => name.includes(type))
    )
      return false;
    if (!distinctiveBigrams.some((pair) => name.includes(pair))) return false;
    let cursor = 0;
    for (const char of typed) {
      const next = name.indexOf(char, cursor);
      if (next < 0) return false;
      cursor = next + 1;
    }
    return true;
  });
}
export function hasDirectNameMatch(query, places) {
  const normalized = String(query || "")
    .normalize("NFKC")
    .replace(/[\s·•・()（）\-_/]/g, "")
    .toLowerCase();
  if (!normalized || !Array.isArray(places)) return false;
  return places.some(
    (place) =>
      typeof place?.name === "string" &&
      place.name
        .normalize("NFKC")
        .replace(/[\s·•・()（）\-_/]/g, "")
        .toLowerCase() === normalized,
  );
}
