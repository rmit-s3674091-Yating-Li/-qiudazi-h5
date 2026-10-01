export type HallFilterEvent = {
  city?: string | null;
  match_type?: string | null;
  level?: string | null;
  event_date?: string | null;
};

export type HallFilters = {
  city?: string | null;
  matchType?: string | null;
  level?: string | null;
  date?: string | null;
};

export function normalizeHallCity(value: string | null | undefined) {
  return value?.normalize("NFKC").trim().toLocaleLowerCase() ?? "";
}

export function matchesHallFilters(event: HallFilterEvent, filters: HallFilters) {
  const city = normalizeHallCity(filters.city);
  if (city && normalizeHallCity(event.city) !== city) return false;
  if (filters.matchType && event.match_type !== filters.matchType) return false;
  if (filters.level && event.level !== filters.level) return false;
  if (filters.date && event.event_date !== filters.date) return false;
  return true;
}
