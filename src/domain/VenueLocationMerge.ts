import type { EventConfig } from "./types";
import type { VenuePlace } from "../utils/mapProvider";

type PlaceHint = Pick<VenuePlace, "name" | "address" | "provider" | "placeId">;
type Coordinates = { latitude: number; longitude: number; provider: string };
type SelectionSource = "explicit_poi" | "pin" | "device";

/** Keep a venue's label, address, coordinates and POI identity from one selection.
 * A reverse-geocoded nearby business is only an address hint, never an accepted POI.
 */
export function mergeVenueLocation(
  current: EventConfig,
  coordinates: Coordinates,
  place: PlaceHint | null | undefined,
  source: SelectionSource,
): EventConfig {
  const explicitPoi = source === "explicit_poi" && Boolean(place?.name?.trim());
  return {
    ...current,
    venue_latitude: coordinates.latitude,
    venue_longitude: coordinates.longitude,
    venue_name: explicitPoi ? place!.name.trim() : current.venue_place_id ? null : current.venue_name,
    venue_address: place?.address?.trim() || null,
    venue_provider: source === "device" ? coordinates.provider : place?.provider || coordinates.provider,
    venue_place_id: explicitPoi ? place?.placeId ?? null : null,
  };
}
