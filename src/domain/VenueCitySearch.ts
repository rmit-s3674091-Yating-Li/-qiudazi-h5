import type { VenuePlace } from "../utils/mapProvider.ts";

export type VenueCityBounds = [south: number, north: number, west: number, east: number];

const aliases: Record<string, string> = {
  beijing: "北京", shanghai: "上海", chengdu: "成都",
  guangzhou: "广州", shenzhen: "深圳", chongqing: "重庆",
};

function cityKey(value: string): string {
  const key = value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "").replace(/市$/u, "");
  return aliases[key] ?? key;
}

function validCityBounds(value: VenuePlace["boundingBox"]): value is VenueCityBounds {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return false;
  const [south, north, west, east] = value;
  // Only accept plausible city-sized mainland-China bounds; never use country/province bounds.
  return south >= 17 && north <= 55 && west >= 73 && east <= 135 &&
    south < north && west < east && north - south <= 8 && east - west <= 10;
}

export function isWithinVenueCityBounds(place: VenuePlace, bounds: VenueCityBounds): boolean {
  const [south, north, west, east] = bounds;
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude) &&
    place.latitude >= south && place.latitude <= north &&
    place.longitude >= west && place.longitude <= east;
}

/** Resolve a city boundary before any English-language POI search.
 * Failure is an upstream/unverified-city error, never a license to search globally.
 */
export async function resolveVenueCityBounds(
  selectedCity: string,
  lookupCity: (city: string) => Promise<VenuePlace[]>,
): Promise<VenueCityBounds> {
  const expected = cityKey(selectedCity);
  if (!expected || expected === "全国") throw new Error("VENUE_CITY_BOUNDARY_UNAVAILABLE");
  const candidates = await lookupCity(selectedCity);
  const match = candidates.find((item) =>
    cityKey(item.name) === expected && validCityBounds(item.boundingBox) &&
    isWithinVenueCityBounds(item, item.boundingBox),
  );
  if (!match || !validCityBounds(match.boundingBox)) throw new Error("VENUE_CITY_BOUNDARY_UNAVAILABLE");
  return match.boundingBox;
}
