/** Quick group-stage bounds mirror create_quick_event's server-side guards. */
export function maxQuickGroupCount(entryCount: number): number {
  if (!Number.isInteger(entryCount) || entryCount < 3) return 0;
  return Math.min(26, Math.floor(entryCount / 2));
}

export function isValidQuickGroupConfig(
  entryCount: number,
  groupCount: number,
  qualifiersPerGroup: number,
): boolean {
  if (!Number.isInteger(groupCount) || !Number.isInteger(qualifiersPerGroup)) return false;
  if (groupCount < 1 || groupCount > maxQuickGroupCount(entryCount)) return false;
  if (qualifiersPerGroup < 1) return false;
  const smallestGroupSize = Math.floor(entryCount / groupCount);
  return qualifiersPerGroup < smallestGroupSize && groupCount * qualifiersPerGroup >= 2;
}
