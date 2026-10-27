/**
 * Offline/adapter-facing venue outcome. An unavailable POI service is never an
 * empty search result. This module does not call Baidu, WeChat or Supabase.
 */
export type VenueCandidate = Readonly<{
  id: string;
  name: string;
  address: string;
}>;
export type VenueSearchOutcome =
  | Readonly<{
      status: "RESULTS";
      candidates: readonly [VenueCandidate, ...VenueCandidate[]];
    }>
  | Readonly<{ status: "NO_RESULTS"; candidates: readonly [] }>
  | Readonly<{
      status: "UNAVAILABLE";
      reason: "OFFLINE_POC" | "NOT_CONFIGURED";
      candidates: readonly [];
    }>
  | Readonly<{
      status: "SERVICE_ERROR";
      reason: "UPSTREAM_FAILURE" | "INVALID_RESPONSE" | "INVALID_INPUT";
      candidates: readonly [];
    }>;

const error = (
  reason: "UPSTREAM_FAILURE" | "INVALID_RESPONSE" | "INVALID_INPUT",
): VenueSearchOutcome => ({ status: "SERVICE_ERROR", reason, candidates: [] });

/**
 * A future real POI adapter must pass only a successful upstream payload here.
 * Transport failures are caught and classified separately; do not turn them
 * into [] or silently drop malformed entries.
 */
export async function classifyVenueSearch(
  city: string,
  query: string,
  fetchCandidates: (city: string, query: string) => Promise<unknown>,
): Promise<VenueSearchOutcome> {
  if (
    typeof city !== "string" ||
    typeof query !== "string" ||
    !city.trim() ||
    !query.trim() ||
    city.length > 80 ||
    query.length > 120 ||
    typeof fetchCandidates !== "function"
  )
    return error("INVALID_INPUT");

  let payload: unknown;
  try {
    payload = await fetchCandidates(city, query);
  } catch {
    return error("UPSTREAM_FAILURE");
  }
  // A hostile adapter response can contain throwing getters or proxies.
  // Normalize into plain DTOs inside this guard; never leak such exceptions to UI.
  try {
    if (!Array.isArray(payload) || payload.length > 50)
      return error("INVALID_RESPONSE");
    if (payload.length === 0) return { status: "NO_RESULTS", candidates: [] };

    const candidates: VenueCandidate[] = [];
    for (const item of payload) {
      if (
        item === null ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        typeof item.address !== "string" ||
        !item.id.trim() ||
        !item.name.trim() ||
        item.id.length > 160 ||
        item.name.length > 160 ||
        item.address.length > 400
      )
        return error("INVALID_RESPONSE");
      candidates.push({ id: item.id, name: item.name, address: item.address });
    }
    return {
      status: "RESULTS",
      candidates: candidates as [VenueCandidate, ...VenueCandidate[]],
    };
  } catch {
    return error("INVALID_RESPONSE");
  }
}
