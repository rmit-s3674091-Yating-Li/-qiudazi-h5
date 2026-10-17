/** Collect bounded venue search variants without disguising provider errors as zero matches. */
export async function collectVenueSearch<T>(
  variants: readonly string[],
  search: (variant: string) => Promise<T[]>,
  stillCurrent: () => boolean = () => true,
): Promise<{ groups: T[][]; hadFailure: boolean; cancelled: boolean }> {
  const groups: T[][] = [];
  let hadFailure = false;
  for (const variant of variants) {
    if (!stillCurrent()) return { groups: [], hadFailure, cancelled: true };
    try {
      const items = await search(variant);
      if (!Array.isArray(items)) throw new Error("INVALID_VENUE_SEARCH_RESULTS");
      if (items.length) groups.push(items);
    } catch {
      hadFailure = true;
    }
    if (!stillCurrent()) return { groups: [], hadFailure, cancelled: true };
  }
  return { groups, hadFailure, cancelled: false };
}
