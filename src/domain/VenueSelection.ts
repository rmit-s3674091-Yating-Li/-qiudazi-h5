import type { VenuePlace } from "../utils/mapProvider";

/**
 * A reverse-geocoded address is a location hint, not an explicitly selected POI.
 * In particular, do not treat the nearest building or business name as the
 * competition venue or persist its place ID when the user merely moved the pin.
 */
export function reverseLocationHint(
  found: VenuePlace,
): Pick<VenuePlace, "name" | "address" | "provider" | "placeId"> {
  return { name: "", address: found.address, provider: found.provider, placeId: null };
}
