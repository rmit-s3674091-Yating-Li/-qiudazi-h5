import type {
  MapProvider,
  VenueCoordinates,
  VenuePlace,
} from "./mapProvider.ts";
type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
type BaiduPlace = {
  uid?: unknown;
  name?: unknown;
  address?: unknown;
  province?: unknown;
  city?: unknown;
  area?: unknown;
  district?: unknown;
  location?: { lat?: unknown; lng?: unknown };
};
type BaiduResponse = {
  status?: unknown;
  message?: unknown;
  partial_upstream_error?: unknown;
  results?: unknown;
  result?: any;
};
export interface BaiduMapProviderOptions {
  ak?: string;
  fetchImpl?: FetchLike;
  region?: string;
  onPartialFailure?: (code: string) => void;
}
function outOfChina(lat: number, lng: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function transformLat(x: number, y: number) {
  let ret =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret +=
    ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  ret +=
    ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) *
      2) /
    3;
  return ret;
}
function transformLng(x: number, y: number) {
  let ret =
    300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret +=
    ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  ret +=
    ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) *
      2) /
    3;
  return ret;
}
function gcj02ToWgs84(lat: number, lng: number) {
  if (outOfChina(lat, lng)) return { lat, lng };
  const a = 6378245,
    ee = 0.00669342162296594323,
    dLat = transformLat(lng - 105, lat - 35),
    dLng = transformLng(lng - 105, lat - 35),
    radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic),
    mgLat =
      lat + (dLat * 180) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI),
    mgLng = lng + (dLng * 180) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: lat * 2 - mgLat, lng: lng * 2 - mgLng };
}
function text(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}
// Only forward stable, non-sensitive proxy error codes; never expose raw upstream messages.
const venueProxyCommonErrors = new Set([
  "AUTH_CHECK_UNAVAILABLE",
  "BAIDU_MAP_AK_MISSING",
]);
const venueProxySearchErrors = new Set([
  "INVALID_QUERY",
  "VENUE_SEARCH_TIMEOUT",
  "BAIDU_PLACE_UPSTREAM_ERROR",
  "BAIDU_PLACE_HTTP_ERROR",
  "BAIDU_PLACE_INVALID_RESPONSE",
  "BAIDU_PLACE_NETWORK_ERROR",
  "BAIDU_PLACE_PERMISSION_DENIED",
  "BAIDU_PLACE_APP_CONFIGURATION_ERROR",
  "BAIDU_PLACE_QUOTA_EXCEEDED",
  "BAIDU_PLACE_CONCURRENCY_LIMIT",
  "BAIDU_PLACE_SERVICE_UNAVAILABLE",
  "BAIDU_PLACE_HTTP_AUTH_ERROR",
  "BAIDU_PLACE_HTTP_RATE_LIMIT",
]);
const venueProxyReverseErrors = new Set([
  "INVALID_LOCATION",
  "VENUE_LOCATION_OUTSIDE_CHINA",
  "VENUE_REVERSE_TIMEOUT",
  "BAIDU_REVERSE_TIMEOUT",
  "BAIDU_REVERSE_UPSTREAM_ERROR",
  "BAIDU_REVERSE_HTTP_ERROR",
  "BAIDU_REVERSE_INVALID_RESPONSE",
  "BAIDU_REVERSE_NETWORK_ERROR",
]);
/** Keep auth, quota, provider and timeout failures distinct from a genuine empty POI list. */
export function venueProxyFailureCode(
  status: number,
  body: unknown,
  reverse: boolean,
): string {
  if (status === 401) return "AUTH_REQUIRED";
  const fallback = reverse
    ? "BAIDU_REVERSE_HTTP_ERROR"
    : "BAIDU_PLACE_HTTP_ERROR";
  if (!body || typeof body !== "object" || Array.isArray(body)) return fallback;
  const code = (body as { error?: unknown }).error;
  return typeof code === "string" &&
    (venueProxyCommonErrors.has(code) ||
      (reverse ? venueProxyReverseErrors : venueProxySearchErrors).has(code))
    ? code
    : fallback;
}
async function withBaiduVenueRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 8000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => request(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("VENUE_PROVIDER_TIMEOUT"));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
function normalizePlace(value: BaiduPlace): VenuePlace | null {
  const latValue = value.location?.lat,
    lngValue = value.location?.lng,
    name = text(value.name);
  if (
    latValue == null ||
    lngValue == null ||
    (typeof latValue === "string" && !latValue.trim()) ||
    (typeof lngValue === "string" && !lngValue.trim())
  )
    return null;
  const rawLat = Number(latValue),
    rawLng = Number(lngValue);
  if (
    !name ||
    !Number.isFinite(rawLat) ||
    rawLat < -90 ||
    rawLat > 90 ||
    !Number.isFinite(rawLng) ||
    rawLng < -180 ||
    rawLng > 180 ||
    outOfChina(rawLat, rawLng)
  )
    return null;
  const converted = gcj02ToWgs84(rawLat, rawLng),
    locality = [
      text(value.province),
      text(value.city),
      text(value.area) || text(value.district),
    ]
      .filter((part, index, parts) => part && parts.indexOf(part) === index)
      .join(""),
    address = text(value.address) || locality || name;
  return {
    name,
    address,
    latitude: converted.lat,
    longitude: converted.lng,
    provider: "baidu",
    placeId: typeof value.uid === "string" && value.uid ? value.uid : null,
  };
}
export function createBaiduMapProvider(
  options: BaiduMapProviderOptions = {},
): MapProvider {
  const ak = options.ak?.trim() || "",
    fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis),
    region = options.region?.trim() || "全国";
  return {
    getCurrentPosition() {
      return new Promise<VenueCoordinates>((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          reject(new Error("GEOLOCATION_UNAVAILABLE"));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) =>
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              provider: "device_geolocation",
              placeId: null,
            }),
          () => reject(new Error("GEOLOCATION_DENIED")),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
        );
      });
    },
    async searchPlaces(query) {
      const keyword = query.trim();
      if (!keyword) return [];
      if (!ak) throw new Error("BAIDU_MAP_AK_MISSING");
      if (!fetchImpl) throw new Error("PLACE_SEARCH_UNAVAILABLE");
      const params = new URLSearchParams({
        query: keyword,
        region,
        ret_coordtype: "gcj02ll",
        output: "json",
        ak,
      });
      const { ok, body } = await withBaiduVenueRequestTimeout(
        async (signal) => {
          const response = await fetchImpl(
            `https://api.map.baidu.com/place/v2/search?${params.toString()}`,
            { signal },
          );
          return {
            ok: response.ok,
            body: (await response.json()) as BaiduResponse,
          };
        },
      );
      if (!ok) throw new Error("BAIDU_PLACE_HTTP_ERROR");
      if (body.status !== 0)
        throw new Error(
          `BAIDU_PLACE_ERROR:${String(body.status ?? "UNKNOWN")}`,
        );
      if (!Array.isArray(body.results))
        throw new Error("BAIDU_PLACE_INVALID_RESPONSE");
      const partialCode = text(body.partial_upstream_error);
      if (partialCode)
        options.onPartialFailure?.(
          venueProxySearchErrors.has(partialCode)
            ? partialCode
            : "BAIDU_PLACE_UPSTREAM_ERROR",
        );
      const places = body.results
        .map((item) => normalizePlace(item as BaiduPlace))
        .filter((item): item is VenuePlace => item !== null);
      if (body.results.length && !places.length)
        throw new Error("BAIDU_PLACE_INVALID_RESPONSE");
      return places;
    },
    async reverseGeocode({ latitude, longitude }) {
      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      )
        throw new Error("VENUE_COORDINATES");
      if (!ak) throw new Error("BAIDU_MAP_AK_MISSING");
      if (!fetchImpl) throw new Error("REVERSE_GEOCODE_UNAVAILABLE");
      const params = new URLSearchParams({
        location: `${latitude},${longitude}`,
        coordtype: "wgs84ll",
        output: "json",
        ak,
      });
      const { ok, body } = await withBaiduVenueRequestTimeout(
        async (signal) => {
          const response = await fetchImpl(
            `https://api.map.baidu.com/reverse_geocoding/v3/?${params.toString()}`,
            { signal },
          );
          return {
            ok: response.ok,
            body: (await response.json()) as BaiduResponse,
          };
        },
      );
      if (!ok) throw new Error("BAIDU_REVERSE_HTTP_ERROR");
      if (body.status !== 0)
        throw new Error(
          `BAIDU_REVERSE_ERROR:${String(body.status ?? "UNKNOWN")}`,
        );
      const result = body.result || {},
        address =
          typeof result.formatted_address === "string"
            ? result.formatted_address.trim()
            : "",
        pois = Array.isArray(result.pois) ? result.pois : [],
        namedPoi = pois.find(
          (p: any) => typeof p?.name === "string" && p.name.trim(),
        ),
        poiName = namedPoi?.name?.trim() || "",
        semantic =
          typeof result.sematic_description === "string"
            ? result.sematic_description.trim()
            : "",
        name = poiName || semantic || address;
      if (!name && !address) return null;
      return {
        name: name || address,
        address: address || name,
        latitude,
        longitude,
        provider: "baidu",
        placeId:
          typeof namedPoi?.uid === "string" && namedPoi.uid.trim()
            ? namedPoi.uid
            : null,
      };
    },
    externalMapUrl({ latitude, longitude, name }) {
      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      )
        throw new Error("VENUE_COORDINATES");
      const destination = name?.trim()
        ? `name:${name.trim()}|latlng:${latitude},${longitude}`
        : `latlng:${latitude},${longitude}`;
      return `https://api.map.baidu.com/marker?location=${encodeURIComponent(`${latitude},${longitude}`)}&title=${encodeURIComponent(name?.trim() || "场地")}&content=${encodeURIComponent(destination)}&output=html`;
    },
    externalDirectionsUrl({ latitude, longitude, name }) {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
        throw new Error("VENUE_COORDINATES");
      return `https://maps.apple.com/?daddr=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}&q=${encodeURIComponent((name || "Destination").trim())}&dirflg=d`;
    },
  };
}
export function createConfiguredBaiduMapProvider(
  region = "全国",
  onPartialFailure?: (code: string) => void,
): MapProvider {
  const proxyFetch: FetchLike = async (input, init) => {
    const url = new URL(input),
      query = url.searchParams.get("query") || "",
      selectedRegion = url.searchParams.get("region") || "全国",
      location = url.searchParams.get("location") || "";
    const { supabase } = await import("../repositories/supabase.ts"),
      session = (await supabase?.auth.getSession())?.data.session;
    if (!session) throw new Error("AUTH_REQUIRED");
    const isReverse = url.pathname.includes("reverse_geocoding"),
      endpoint = isReverse
        ? `/api/venue-reverse?location=${encodeURIComponent(location)}`
        : `/api/venue-search?query=${encodeURIComponent(query)}&region=${encodeURIComponent(selectedRegion)}`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: init?.signal,
    });
    if (response.status === 401) throw new Error("AUTH_REQUIRED");
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new Error(venueProxyFailureCode(response.status, body, isReverse));
    }
    return { ok: true, json: () => response.json() };
  };
  return createBaiduMapProvider({
    ak: "server-proxy",
    fetchImpl: proxyFetch,
    region,
    onPartialFailure,
  });
}
