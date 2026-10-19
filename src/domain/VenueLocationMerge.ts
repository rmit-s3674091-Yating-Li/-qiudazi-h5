
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
