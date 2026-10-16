/** UI-only identifier validation. The Edge route must authorize every lookup. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeScoreExceptionEventId(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return uuid.test(normalized) ? normalized : null;
}

/** Deep links are a navigation hint only; the Edge endpoint reauthorizes the query. */
export function scoreExceptionEventFromSearch(search: string): string | null {
  return normalizeScoreExceptionEventId(new URLSearchParams(search).get("score_event") ?? "");
}
