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

/** Read a single own data descriptor; never invoke getters or accept inherited DTO fields. */
function ownData(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor))
    throw new Error("INVALID_RESPONSE");
  return descriptor.value;
}

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
  // Snapshot own data descriptors exactly once: a getter may return a valid
  // field during validation and a different field during copying. Sparse arrays
  // and inherited candidates are not legitimate successful POI responses.
  try {
    if (!Array.isArray(payload)) return error("INVALID_RESPONSE");
    const length = ownData(payload, "length");
    if (!Number.isSafeInteger(length) || (length as number) > 50)
      return error("INVALID_RESPONSE");
    if (length === 0) return { status: "NO_RESULTS", candidates: [] };

    const candidates: VenueCandidate[] = [];
    const ids = new Set<string>();
    for (let index = 0; index < (length as number); index++) {
      const item = ownData(payload, String(index));
      if (item === null || typeof item !== "object" || Array.isArray(item))
        return error("INVALID_RESPONSE");
      const id = ownData(item, "id");
      const name = ownData(item, "name");
      const address = ownData(item, "address");
      if (
        typeof id !== "string" ||
        typeof name !== "string" ||
        typeof address !== "string" ||
        !id.trim() ||
        !name.trim() ||
        id.length > 160 ||
        name.length > 160 ||
        address.length > 400 ||
        ids.has(id)
      )
        return error("INVALID_RESPONSE");
      ids.add(id);
      candidates.push({ id, name, address });
    }
    return {
      status: "RESULTS",
      candidates: candidates as [VenueCandidate, ...VenueCandidate[]],
    };
  } catch {
    return error("INVALID_RESPONSE");
  }
}
