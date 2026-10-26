import { hasDirectNameMatch } from "./venue-search-relevance.js";
import { randomUUID } from "node:crypto";
import { hasSafeNameSequenceMatch } from "./venue-search-relevance.js";
import { classifyBaiduTerminalStatus } from "./venue-search-terminal-status.js";
import { runVenueAuthDiagnostic } from "./venue-auth-diagnostic.js";
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://rtmjzmgrhifjzxaliltm.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_vM47k7tVER77x3bpGSkDdw_dowVImzn";
const VENUE_SEARCH_DEADLINE_MS = 6500;
function createRequestDeadline() {
  const controller = new AbortController();
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("VENUE_SEARCH_DEADLINE"));
    }, VENUE_SEARCH_DEADLINE_MS);
  });
  return {
    traceId: randomUUID(),
    requestIndex: 0,
    previewStages: process.env.VERCEL_ENV === "preview" ? [] : null,
    signal: controller.signal,
    race: (promise) => Promise.race([promise, expired]),
    timedOut: () => controller.signal.aborted,
    close: () => clearTimeout(timer),
  };
}
function value(v) {
  return Array.isArray(v) ? v[0] : typeof v === "string" ? v : "";
}
// Supabase /auth/v1/user must return an actual user identity, not merely HTTP 200.
const authUserId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validAuthUser(user) {
  return (
    user !== null &&
    typeof user === "object" &&
    !Array.isArray(user) &&
    typeof user.id === "string" &&
    authUserId.test(user.id)
  );
}
function resultArray(body) {
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.result)) return body.result;
  return null;
}
function okResults(body, health) {
  return (health === null || health === "malformed") && body?.status === 0
    ? (resultArray(body) || []).filter(
        (item) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof item.name === "string" &&
          item.name.trim(),
      )
    : [];
}
function upstreamHealth(response, body) {
  if (!response.ok) return "http";
  if (typeof body?.status === "number" && body.status !== 0) return "business";
  const records = resultArray(body);
  if (
    body?.status !== 0 ||
    !records ||
    records.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        typeof item.name !== "string" ||
        !item.name.trim(),
    )
  )
    return "malformed";
  return null;
}
function validLocation(location) {
  if (!location || typeof location !== "object") return false;
  const { lat, lng } = location;
  if (
    ![lat, lng].every(
      (v) =>
        (typeof v === "string" || typeof v === "number") &&
        String(v).trim() !== "",
    )
  )
    return false;
  const latitude = Number(lat),
    longitude = Number(lng);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 0.8293 &&
    latitude <= 55.8271 &&
    longitude >= 72.004 &&
    longitude <= 137.8347
  );
}
function normalizeCity(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/市$/u, "");
}
function addressCity(value) {
  const address = String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "");
  const match = address.match(
    /(?:^|省|自治区|特别行政区)([^省市区县]{2,16})市/u,
  );
  return match ? normalizeCity(match[1]) : "";
}
function childResults(parent) {
  const children = Array.isArray(parent?.children) ? parent.children : [];
  return children
    .map((child) => {
      const differentProvince = Boolean(
        child?.province &&
          normalizeCity(child.province) !== normalizeCity(parent?.province),
      );
      return {
        uid: child?.uid || undefined,
        name: [parent?.name, child?.show_name || child?.name]
          .filter(Boolean)
          .join(" "),
        address:
          child?.address || (differentProvince ? "" : parent?.address || ""),
        location: child?.location,
        province: child?.province || parent?.province,
        city: child?.city || (differentProvince ? undefined : parent?.city),
        district:
          child?.district || child?.area || parent?.district || parent?.area,
        area:
          child?.area || child?.district || parent?.area || parent?.district,
      };
    })
    .filter((item) => item.name && validLocation(item.location));
}
// A provider can return a POI tagged with the requested city but pinned hundreds of
// kilometres away. This coarse sanity check is deliberately NOT a city-boundary
// substitute: it rejects only unmistakable cross-region coordinates for cities
// with a known anchor, while keeping suburban venues and other cities unchanged.
function grosslyOutsideRequestedCity(item, expected) {
  const anchors = {
    北京: [39.9042, 116.4074],
    上海: [31.2304, 121.4737],
    成都: [30.5728, 104.0668],
  };
  const anchor = anchors[expected];
  if (!anchor || !validLocation(item.location)) return false;
  const latitude = Number(item.location.lat),
    longitude = Number(item.location.lng);
  const northKm = (latitude - anchor[0]) * 111.2;
  const eastKm =
    (longitude - anchor[1]) * 111.2 * Math.cos((anchor[0] * Math.PI) / 180);
  return Math.hypot(northKm, eastKm) > 260;
}
function inRequestedCity(item, region) {
  const expected = normalizeCity(region);
  if (!expected || expected === "全国") return true;
  if (grosslyOutsideRequestedCity(item, expected)) return false;
  const city = normalizeCity(item.city),
    explicitCity = addressCity(item.address),
    province = normalizeCity(item.province);
  const municipalities = ["北京", "上海", "天津", "重庆"];
  if (
    province &&
    (municipalities.includes(expected) || municipalities.includes(province)) &&
    province !== expected
  )
    return false;
  if (explicitCity && explicitCity !== expected) return false;
  if (city) return city === expected;
  if (explicitCity) return true;
  if (municipalities.includes(expected) && province === expected) return true;
  const address = String(item.address || "")
    .normalize("NFKC")
    .replace(/\s+/g, "");
  return (
    address.includes(`${expected}市`) || address.includes(`${expected}自治州`)
  );
}
// Keep candidates from later, more specific query variants visible to the client ranker.
// A first broad variant can fill the 20-result budget before an exact-name alias
// is queried. Interleave validated groups instead of truncating the first group.
function mergeResults(region, ...groups) {
  const queues = groups.map((group) => {
    const candidates = [];
    for (const item of group) {
      if (!item || !item.name) continue;
      if (inRequestedCity(item, region) && validLocation(item.location))
        candidates.push(item);
      for (const child of childResults(item))
        if (inRequestedCity(child, region)) candidates.push(child);
    }
    return candidates;
  });
  const out = [],
    seen = new Set();
  const maxLength = Math.max(0, ...queues.map((group) => group.length));
  for (let index = 0; index < maxLength && out.length < 20; index++) {
    for (const group of queues) {
      const item = group[index];
      if (!item) continue;
      const lat = Number(item.location.lat),
        lng = Number(item.location.lng);
      const key = item.uid
        ? `uid:${item.uid}`
        : `${String(item.name).trim()}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length === 20) break;
    }
  }
  return out;
}
function hasMalformedLocations(region, groups) {
  return groups.some((group) =>
    group.some(
      (item) =>
        item?.name &&
        inRequestedCity(item, region) &&
        !validLocation(item.location),
    ),
  );
}
function queryVariants(query) {
  const clean = query.normalize("NFKC").trim();
  // Generic suffix relaxation works for unlisted parks, stations and sports facilities.
  // Curated proper-name aliases supplement it; they do not replace provider lookup.
  const aliases = {
    奥森: ["奥林匹克森林公园", "奥森网球"],
    绿心: ["城市绿心森林公园", "北京城市绿心森林公园"],
    国家网球: ["国家网球中心"],
  };
  const relaxed = clean
    .replace(
      /(?:网球运动中心|网球俱乐部|网球中心|网球场|体育中心|运动中心|体育馆|运动馆|场馆|球场|森林公园|公园|地铁站|车站|中心|站)$/u,
      "",
    )
    .trim();
  const variants = [clean];
  // Never broaden generic two-character words such as "网球" or "中心".
  if (
    relaxed !== clean &&
    (relaxed.length >= 3 || Object.hasOwn(aliases, relaxed))
  )
    variants.push(relaxed);
  for (const key of [clean, relaxed])
    for (const alias of aliases[key] || []) variants.push(alias);
  const venueWord =
    /(网球|球场|体育|运动|公园|中心|场馆|俱乐部|酒店|学校|大学|学院|站)$/u.test(
      clean,
    );
  if (!venueWord && clean.length >= 2 && clean.length <= 8)
    variants.push(`${clean}网球`, `${clean}公园`);
  return [...new Set(variants)].slice(0, 5);
}
async function readJson(response) {
  return response.json().catch(() => null);
}
// Preview-only endpoint counts; never emit tokens, key, query, POI names, addresses or coordinates.
function capturePreviewVenueStage(
  url,
  body,
  health,
  deadline,
  sequence,
  httpStatus = null,
) {
  if (process.env.VERCEL_ENV !== "preview") return;
  const parsed = new URL(url),
    rows = resultArray(body),
    region = parsed.searchParams.get("region") || "全国";
  const valid = rows
    ? rows.filter((item) => validLocation(item?.location))
    : null;
  const city = valid
    ? valid.filter((item) => inRequestedCity(item, region))
    : null;
  const stage = {
    endpoint: parsed.pathname,
    status: typeof body?.status === "number" ? body.status : null,
    http_status: httpStatus,
    health: health || null,
    raw_count: rows?.length ?? null,
    valid_coordinate_count: valid?.length ?? null,
    city_retained_count: city?.length ?? null,
  };
  if (
    Array.isArray(deadline.previewStages) &&
    deadline.previewStages.length < 24
  )
    deadline.previewStages.push(stage);
  console.info(
    "VENUE_POI_STAGE",
    JSON.stringify({
      trace_id: deadline.traceId,
      sequence,
      endpoint: stage.endpoint,
      upstream_status: stage.status,
      http_status: stage.http_status,
      health: health || null,
      raw_count: stage.raw_count,
      valid_coordinate_count: stage.valid_coordinate_count,
      city_coordinate_count: stage.city_retained_count,
    }),
  );
}
function previewVenueResponse(deadline, results) {
  return Array.isArray(deadline.previewStages)
    ? {
        search_diagnostics: {
          version: 1,
          endpoints: deadline.previewStages,
          merged_count: results.length,
          client_rank_count: null,
          client_rank_status: "NOT_EXPOSED",
        },
      }
    : {};
}
// An independent Suggestion service may be denied while Region search succeeds.
// Preserve a genuinely relevant, city-valid POI, but never continue an AK-wide
// terminal failure into more V2 or alias calls. Report the partial failure.
function respondIfBaiduTerminal(
  res,
  deadline,
  statuses,
  httpStatuses,
  region,
  groups,
  variants,
) {
  const businessError = classifyBaiduTerminalStatus(statuses);
  const authHttp = httpStatuses.some((code) => code === 401 || code === 403);
  const rateHttp = httpStatuses.some((code) => code === 429);
  const error =
    businessError ||
    (authHttp
      ? "BAIDU_PLACE_HTTP_AUTH_ERROR"
      : rateHttp
        ? "BAIDU_PLACE_HTTP_RATE_LIMIT"
        : null);
  if (!error) return false;
  const usable = mergeResults(region, ...groups);
  const relevant = variants.some(
    (variant) =>
      hasDirectNameMatch(variant, usable) ||
      hasSafeNameSequenceMatch(variant, usable),
  );
  const upstream_statuses = [
    ...new Set(statuses.filter((s) => Number.isInteger(s) && s !== 0)),
  ].slice(0, 4);
  if (usable.length && relevant) {
    res.status(200).json({
      status: 0,
      message: "partial upstream success",
      results: usable,
      total: usable.length,
      result_type: "poi_type",
      query_type: "suggestion+region",
      query_variants: variants,
      partial_upstream_error: error,
      upstream_statuses,
      ...previewVenueResponse(deadline, usable),
    });
    return true;
  }
  const httpStatus =
    error === "BAIDU_PLACE_QUOTA_EXCEEDED" ||
    error === "BAIDU_PLACE_CONCURRENCY_LIMIT" ||
    error === "BAIDU_PLACE_HTTP_RATE_LIMIT"
      ? 429
      : 502;
  res
    .status(httpStatus)
    .json({ error, upstream_statuses, ...previewVenueResponse(deadline, []) });
  return true;
}
async function fetchBaiduPlace(url, deadline) {
  const sequence = ++deadline.requestIndex;
  try {
    const response = await deadline.race(
        fetch(url, {
          headers: { "User-Agent": "qiudazi-h5/1.0" },
          signal: deadline.signal,
        }),
      ),
      body = await deadline.race(readJson(response)),
      health = upstreamHealth(response, body);
    capturePreviewVenueStage(
      url,
      body,
      health,
      deadline,
      sequence,
      response.status,
    );
    return { body, health, httpStatus: response.status };
  } catch {
    const health = deadline.timedOut() ? "timeout" : "network";
    capturePreviewVenueStage(url, null, health, deadline, sequence);
    return { body: null, health, httpStatus: null };
  }
}
async function baiduV3(variant, region, ak, deadline) {
  const common = {
      query: variant,
      region,
      region_limit: "true",
      ret_coordtype: "gcj02ll",
      output: "json",
      ak,
    },
    suggestionParams = new URLSearchParams(common),
    regionParams = new URLSearchParams({
      ...common,
      scope: "2",
      page_num: "0",
      page_size: "20",
      address_result: "false",
    }),
    [suggestion, regional] = await Promise.all([
      fetchBaiduPlace(
        `https://api.map.baidu.com/place/v3/suggestion?${suggestionParams.toString()}`,
        deadline,
      ),
      fetchBaiduPlace(
        `https://api.map.baidu.com/place/v3/region?${regionParams.toString()}`,
        deadline,
      ),
    ]);
  return {
    results: [
      ...okResults(suggestion.body, suggestion.health),
      ...okResults(regional.body, regional.health),
    ],
    statuses: [suggestion.body?.status, regional.body?.status],
    httpStatuses: [suggestion.httpStatus, regional.httpStatus],
    health: [suggestion.health, regional.health],
  };
}
async function baiduV2(variant, region, ak, deadline) {
  const suggestionParams = new URLSearchParams({
      query: variant,
      region,
      city_limit: "true",
      ret_coordtype: "gcj02ll",
      output: "json",
      ak,
    }),
    searchParams = new URLSearchParams({
      query: variant,
      region,
      city_limit: "true",
      ret_coordtype: "gcj02ll",
      scope: "2",
      page_num: "0",
      page_size: "20",
      output: "json",
      ak,
    }),
    [suggestion, search] = await Promise.all([
      fetchBaiduPlace(
        `https://api.map.baidu.com/place/v2/suggestion?${suggestionParams.toString()}`,
        deadline,
      ),
      fetchBaiduPlace(
        `https://api.map.baidu.com/place/v2/search?${searchParams.toString()}`,
        deadline,
      ),
    ]);
  return {
    results: [
      ...okResults(suggestion.body, suggestion.health),
      ...okResults(search.body, search.health),
    ],
    statuses: [suggestion.body?.status, search.body?.status],
    httpStatuses: [suggestion.httpStatus, search.httpStatus],
    health: [suggestion.health, search.health],
  };
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const authorization =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization
      : "";
  if (!authorization.startsWith("Bearer ") || !SUPABASE_ANON_KEY) {
    res.status(401).json({ error: "AUTH_REQUIRED" });
    return;
  }
  const deadline = createRequestDeadline();
  let authenticatedUserId;
  try {
    try {
      const authResponse = await deadline.race(
        fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization },
          signal: deadline.signal,
        }),
      );
      if (!authResponse.ok) {
        const denied =
          authResponse.status === 401 || authResponse.status === 403;
        res
          .status(denied ? 401 : 503)
          .json({ error: denied ? "AUTH_REQUIRED" : "AUTH_CHECK_UNAVAILABLE" });
        return;
      }
      const authUser = await deadline.race(authResponse.json());
      if (!validAuthUser(authUser)) {
        res.status(503).json({ error: "AUTH_CHECK_UNAVAILABLE" });
        return;
      }
      authenticatedUserId = authUser.id;
    } catch {
      res.status(deadline.timedOut() ? 504 : 503).json({
        error: deadline.timedOut()
          ? "VENUE_SEARCH_TIMEOUT"
          : "AUTH_CHECK_UNAVAILABLE",
      });
      return;
    }
    if (Object.hasOwn(req.query || {}, "diagnostic")) {
      deadline.close();
      await runVenueAuthDiagnostic(req, res, authenticatedUserId);
      return;
    }
    const query = value(req.query?.query).trim(),
      region = value(req.query?.region).trim() || "全国";
    if (!query || query.length > 120 || region.length > 60) {
      res.status(400).json({ error: "INVALID_QUERY" });
      return;
    }
    const ak = (process.env.BAIDU_MAP_AK || "").trim();
    if (!ak) {
      res.status(503).json({ error: "BAIDU_MAP_AK_MISSING" });
      return;
    }
    try {
      const variants = queryVariants(query),
        groups = [],
        statuses = [],
        health = [];
      for (const variant of variants) {
        if (deadline.timedOut()) break;
        const primary = await baiduV3(variant, region, ak, deadline);
        statuses.push(...primary.statuses);
        health.push(...primary.health);
        if (primary.results.length) groups.push(primary.results);
        if (
          respondIfBaiduTerminal(
            res,
            deadline,
            primary.statuses,
            primary.httpStatuses,
            region,
            groups,
            variants,
          )
        )
          return;
        if (
          !deadline.timedOut() &&
          !hasDirectNameMatch(variant, mergeResults(region, primary.results))
        ) {
          const fallback = await baiduV2(variant, region, ak, deadline);
          statuses.push(...fallback.statuses);
          health.push(...fallback.health);
          if (fallback.results.length) groups.push(fallback.results);
          if (
            respondIfBaiduTerminal(
              res,
              deadline,
              fallback.statuses,
              fallback.httpStatuses,
              region,
              groups,
              variants,
            )
          )
            return;
        }
      }
      const results = mergeResults(region, ...groups),
        malformedCoordinates = hasMalformedLocations(region, groups),
        nonZero = statuses
          .filter(
            (status) => Number.isFinite(Number(status)) && Number(status) !== 0,
          )
          .map(Number);
      if (!results.length) {
        if (deadline.timedOut()) {
          res.status(504).json({
            error: "VENUE_SEARCH_TIMEOUT",
            ...previewVenueResponse(deadline, []),
          });
          return;
        }
        if (nonZero.length) {
          res.status(502).json({
            error: "BAIDU_PLACE_UPSTREAM_ERROR",
            upstream_statuses: [...new Set(nonZero)].slice(0, 4),
            ...previewVenueResponse(deadline, []),
          });
          return;
        }
        if (health.includes("http")) {
          res.status(502).json({
            error: "BAIDU_PLACE_HTTP_ERROR",
            ...previewVenueResponse(deadline, []),
          });
          return;
        }
        if (health.includes("malformed") || malformedCoordinates) {
          res.status(502).json({
            error: "BAIDU_PLACE_INVALID_RESPONSE",
            ...previewVenueResponse(deadline, []),
          });
          return;
        }
        if (health.includes("network")) {
          res.status(502).json({
            error: "BAIDU_PLACE_NETWORK_ERROR",
            ...previewVenueResponse(deadline, []),
          });
          return;
        }
      }
      res.status(200).json({
        status: 0,
        message: "ok",
        results,
        total: results.length,
        result_type: "poi_type",
        query_type: "suggestion+region",
        query_variants: variants,
        ...previewVenueResponse(deadline, results),
      });
    } catch {
      res.status(deadline.timedOut() ? 504 : 502).json({
        error: deadline.timedOut()
          ? "VENUE_SEARCH_TIMEOUT"
          : "BAIDU_PLACE_NETWORK_ERROR",
      });
    }
  } finally {
    deadline.close();
  }
}
