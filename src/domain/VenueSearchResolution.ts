/** Collect bounded venue search variants without disguising provider errors as zero matches. */
export async function collectVenueSearch<T>(
  variants: readonly string[],
  search: (variant: string) => Promise<T[]>,
  stillCurrent: () => boolean = () => true,
  hasRelevantCandidate: (groups: readonly T[][]) => boolean = () => false,
): Promise<{ groups: T[][]; hadFailure: boolean; cancelled: boolean }> {
  const groups: T[][] = [];
  let hadFailure = false;
  for (const variant of variants) {
    if (!stillCurrent()) return { groups: [], hadFailure, cancelled: true };
    try {
      const items = await search(variant);
      if (!Array.isArray(items))
        throw new Error("INVALID_VENUE_SEARCH_RESULTS");
      if (items.length) groups.push(items);
    } catch (error) {
      hadFailure = true;
      const code = error instanceof Error ? error.message : "";
      // An AK/permission/quota failure is global to this provider request,
      // not evidence that another spelling of the same place might work.
      if (
        [
          "BAIDU_PLACE_PERMISSION_DENIED",
          "BAIDU_PLACE_APP_CONFIGURATION_ERROR",
          "BAIDU_PLACE_QUOTA_EXCEEDED",
          "BAIDU_PLACE_CONCURRENCY_LIMIT",
          "BAIDU_PLACE_SERVICE_UNAVAILABLE",
          "BAIDU_PLACE_HTTP_AUTH_ERROR",
          "BAIDU_PLACE_HTTP_RATE_LIMIT",
          "BAIDU_MAP_AK_MISSING",
          "AUTH_REQUIRED",
          "AUTH_CHECK_UNAVAILABLE",
        ].includes(code)
      )
        break;
    }
    if (!stillCurrent()) return { groups: [], hadFailure, cancelled: true };
    // Once a relevant candidate exists, do not block its display on slower,
    // redundant queries. Keep fallback variants when the first result is irrelevant.
    if (hasRelevantCandidate(groups)) break;
  }
  return { groups, hadFailure, cancelled: false };
}
