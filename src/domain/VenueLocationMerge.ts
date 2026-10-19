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
  // Reopening any saved map location (POI or manually chosen pin) must not
  // replace its stored venue/address with a fresh nearby reverse-geocode hint.
  // Only a new position, explicit POI, or device location changes the selection.
  if (
    source === "pin" &&
    current.venue_latitude === coordinates.latitude &&
    current.venue_longitude === coordinates.longitude
  ) return current;
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
/** Treat punctuation/spacing and the optional Chinese city suffix as presentation only. */
export function sameVenueCity(a: EventConfig["city"], b: EventConfig["city"]): boolean {
  const key = (city: EventConfig["city"]) =>
    String(city ?? "").normalize("NFKC").replace(/\s+/g, "").replace(/市$/u, "").toLowerCase();
  return key(a) === key(b);
}

/** A city change invalidates the entire previous venue selection, including court text.
 * Otherwise a Beijing POI may silently survive after the event is moved to Shanghai.
 */
export function resetVenueOnCityChange(current: EventConfig, city: EventConfig["city"]): EventConfig {
  if (sameVenueCity(current.city, city)) return { ...current, city };
  return {
    ...current,
    city,
    venue: null,
    venue_name: null,
    venue_address: null,
    venue_latitude: null,
    venue_longitude: null,
    venue_place_id: null,
    venue_provider: null,
  };
}
