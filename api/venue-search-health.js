function coordinate(value, min, max) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function previewPlace(item) {
  const lat = coordinate(item?.location?.lat, -90, 90);
  const lng = coordinate(item?.location?.lng, -180, 180);
  if (lat === null || lng === null) return null;
  return {
    name: typeof item.name === "string" ? item.name : null,
    address: typeof item.address === "string" ? item.address : null,
    uid: typeof item.uid === "string" ? item.uid : null,
    location: { lat, lng },
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (process.env.VERCEL_ENV !== "preview") {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const ak = (process.env.BAIDU_MAP_AK || "").trim();
  if (!ak) {
    res.status(200).json({ configured: false, upstream_ok: false, error: "BAIDU_MAP_AK_MISSING" });
    return;
  }
  const params = new URLSearchParams({
    query: "北投网球运动中心",
    region: "北京",
    region_limit: "true",
    ret_coordtype: "gcj02ll",
    page_size: "5",
    output: "json",
    ak,
  });
  try {
    const upstream = await fetch(`https://api.map.baidu.com/place/v3/region?${params.toString()}`, {
      headers: { "User-Agent": "qiudazi-h5/1.0" },
    });
    let body;
    try { body = await upstream.json(); } catch { body = null; }
    const validBody = body && typeof body === "object" && !Array.isArray(body);
    const status = validBody && typeof body.status === "number" ? body.status : null;
    const rawResults = validBody && Array.isArray(body.results) ? body.results : null;
    const results = (rawResults || []).map(previewPlace).filter(Boolean).slice(0, 3);
    const error = !upstream.ok
      ? "BAIDU_PLACE_HTTP_ERROR"
      : status !== 0
        ? status === null ? "BAIDU_PLACE_INVALID_RESPONSE" : "BAIDU_PLACE_UPSTREAM_ERROR"
        : !rawResults || (rawResults.length > 0 && results.length === 0)
          ? "BAIDU_PLACE_INVALID_RESPONSE"
          : null;
    res.status(200).json({
      configured: true,
      http_ok: upstream.ok,
      upstream_ok: error === null,
      upstream_status: status,
      upstream_message: typeof body?.message === "string" ? body.message.slice(0, 160) : null,
      result_count: results.length,
      results,
      ...(error ? { error } : {}),
    });
  } catch {
    res.status(200).json({ configured: true, upstream_ok: false, error: "BAIDU_PLACE_NETWORK_ERROR" });
  }
}
