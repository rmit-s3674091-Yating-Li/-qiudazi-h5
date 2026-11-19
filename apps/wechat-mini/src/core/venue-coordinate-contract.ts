/**
 * Offline-only coordinate provenance gate for the WeChat <Map> boundary.
 *
 * Taro's Map rendering coordinates must not be fed an unlabelled Baidu, OSM,
 * device or manually selected point. This module does NOT implement geodesy,
 * verify a provider, make a request, or certify a real mini-program map.
 */
export type CoordinateCrs = "WGS84" | "GCJ02" | "BD09";
export type CoordinateSource =
  | "baidu"
  | "tencent"
  | "amap"
  | "openstreetmap"
  | "device"
  | "manual_pin";

export type CoordinateConversion = Readonly<{
  from: CoordinateCrs;
  to: CoordinateCrs;
  adapterId: string;
}>;

export type VenueCoordinateObservation = Readonly<{
  city: string;
  latitude: number;
  longitude: number;
  crs: CoordinateCrs;
  source: CoordinateSource;
  placeId?: string | null;
  previousConversion?: CoordinateConversion | null;
}>;

/** Inject a verified implementation later; tests inject a fake, never an API. */
export type CoordinateConverter = (
  input: Readonly<{
    latitude: number;
    longitude: number;
    from: CoordinateCrs;
    to: "GCJ02";
  }>,
) => Readonly<{
  latitude: number;
  longitude: number;
  from: CoordinateCrs;
  to: "GCJ02";
  adapterId: string;
}>;

export type MapCoordinateDecision =
  | Readonly<{
      status: "ready_mock_only";
      verification: "OFFLINE_MOCK_ONLY";
      point: Readonly<{ latitude: number; longitude: number; crs: "GCJ02" }>;
      provenance: Readonly<{
        city: string;
        source: CoordinateSource;
        placeId: string | null;
        originalCrs: CoordinateCrs;
        conversion: CoordinateConversion | null;
      }>;
    }>
  | Readonly<{
      status: "blocked";
      reason:
        | "INVALID_COORDINATE_INPUT"
        | "CITY_MISMATCH"
        | "INCONSISTENT_PROVENANCE"
        | "MULTIPLE_TRANSFORMS_BLOCKED"
        | "CONVERSION_REQUIRED"
        | "CONVERSION_FAILED";
    }>;

const crsSet = new Set<unknown>(["WGS84", "GCJ02", "BD09"]);
const sourceSet = new Set<unknown>([
  "baidu",
  "tencent",
  "amap",
  "openstreetmap",
  "device",
  "manual_pin",
]);
const adapterIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/;
const placeIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validPoint(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

function validCity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 64
  );
}

function validConversion(value: unknown): value is CoordinateConversion {
  return (
    isRecord(value) &&
    crsSet.has(value.from) &&
    crsSet.has(value.to) &&
    value.from !== value.to &&
    typeof value.adapterId === "string" &&
    adapterIdPattern.test(value.adapterId)
  );
}

/**
 * Explicit GCJ02 output for an offline Taro Map mock. The source CRS is never
 * guessed from provider name. Already-converted coordinates are not converted
 * a second time. Multi-hop transformations are blocked until separately
 * reviewed; do not use this as an automatic production conversion pipeline.
 */
export function prepareMockWeappMapPoint(
  raw: unknown,
  selectedCity: string,
  converter?: CoordinateConverter,
): MapCoordinateDecision {
  try {
    if (
      !isRecord(raw) ||
      !validCity(raw.city) ||
      !validCity(selectedCity) ||
      !validPoint(raw.latitude, raw.longitude) ||
      !crsSet.has(raw.crs) ||
      !sourceSet.has(raw.source) ||
      (raw.placeId !== undefined &&
        raw.placeId !== null &&
        (typeof raw.placeId !== "string" ||
          !placeIdPattern.test(raw.placeId))) ||
      (raw.previousConversion !== undefined &&
        raw.previousConversion !== null &&
        !validConversion(raw.previousConversion))
    ) {
      return { status: "blocked", reason: "INVALID_COORDINATE_INPUT" };
    }

    const observation = raw as VenueCoordinateObservation;
    if (observation.city.trim() !== selectedCity.trim()) {
      return { status: "blocked", reason: "CITY_MISMATCH" };
    }
    const previous = observation.previousConversion ?? null;
    if (previous && previous.to !== observation.crs) {
      return { status: "blocked", reason: "INCONSISTENT_PROVENANCE" };
    }
    if (previous && observation.crs !== "GCJ02") {
      return { status: "blocked", reason: "MULTIPLE_TRANSFORMS_BLOCKED" };
    }

    let latitude = observation.latitude;
    let longitude = observation.longitude;
    let conversion = previous;
    if (observation.crs !== "GCJ02") {
      if (!converter) {
        return { status: "blocked", reason: "CONVERSION_REQUIRED" };
      }
      try {
        const converted = converter({
          latitude,
          longitude,
          from: observation.crs,
          to: "GCJ02",
        });
        if (
          !converted ||
          converted.from !== observation.crs ||
          converted.to !== "GCJ02" ||
          !validPoint(converted.latitude, converted.longitude) ||
          typeof converted.adapterId !== "string" ||
          !adapterIdPattern.test(converted.adapterId)
        ) {
          return { status: "blocked", reason: "CONVERSION_FAILED" };
        }
        latitude = converted.latitude;
        longitude = converted.longitude;
        conversion = {
          from: converted.from,
          to: converted.to,
          adapterId: converted.adapterId,
        };
      } catch {
        return { status: "blocked", reason: "CONVERSION_FAILED" };
      }
    }

    return {
      status: "ready_mock_only",
      verification: "OFFLINE_MOCK_ONLY",
      point: { latitude, longitude, crs: "GCJ02" },
      provenance: {
        city: observation.city.trim(),
        source: observation.source,
        placeId: observation.placeId ?? null,
        originalCrs: previous?.from ?? observation.crs,
        conversion,
      },
    };
  } catch {
    // Malformed object/getter must never escape into a map side effect.
    return { status: "blocked", reason: "INVALID_COORDINATE_INPUT" };
  }
}
