import { classifyBaiduTerminalStatus } from "./venue-search-terminal-status.js";

export const DIAGNOSTIC_COMMIT =
  "chore(venues): temporary authenticated Preview Baidu diagnosis";
export const DIAGNOSTIC_EXPIRES = 1793034713256;
export const DIAGNOSTIC_USER = "bff93e7d-40ef-4176-a124-012f80373e0e";
export const DIAGNOSTIC_MODE = "p3-auth-matrix-20261026";
const MAX_BYTES = 65536;
let invocations = 0; // Per warm instance; no claim of a distributed quota.

async function boundedJson(response) {
  if (!response.body) throw new Error("INVALID_RESPONSE");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function safeMessage(message, ak) {
  return String(message || "")
    .split(ak)
    .join("[REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[URL_REDACTED]")
    .replace(/[A-Za-z0-9_=-]{16,}/g, "[TOKEN_REDACTED]")
    .replace(/[\r\n\t]/g, " ")
    .slice(0, 180);
}

export async function runVenueAuthDiagnostic(req, res, userId) {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "feature/v8-confirmed-20261011" ||
    process.env.VERCEL_GIT_COMMIT_MESSAGE?.trim() !== DIAGNOSTIC_COMMIT ||
    Date.now() >= DIAGNOSTIC_EXPIRES
  ) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  if (userId !== DIAGNOSTIC_USER) {
    res.status(403).json({ error: "DIAGNOSTIC_FORBIDDEN" });
    return;
  }
  if (
    req.query.diagnostic !== DIAGNOSTIC_MODE ||
    Object.keys(req.query).length !== 1 ||
    req.headers["x-venue-diagnostic"] !== DIAGNOSTIC_MODE
  ) {
    res.status(400).json({ error: "INVALID_DIAGNOSTIC_REQUEST" });
    return;
  }
  const ak = (process.env.BAIDU_MAP_AK || "").trim();
  if (!ak) {
    res.status(503).json({ error: "BAIDU_MAP_AK_MISSING" });
    return;
  }
  if (invocations >= 1) {
    res.status(429).json({ error: "DIAGNOSTIC_INSTANCE_LIMIT" });
    return;
  }
  invocations++;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const rows = [];
  try {
    // Exactly eight official requests, no retry, no normal-search fallback.
    for (const query of ["奥森", "绿心公园"]) {
      rows.push(
        ...(await Promise.all(
          [
            ["/place/v2/suggestion", { city_limit: "true" }],
            [
              "/place/v2/search",
              {
                city_limit: "true",
                scope: "2",
                page_num: "0",
                page_size: "20",
              },
            ],
            ["/place/v3/suggestion", { region_limit: "true" }],
            [
              "/place/v3/region",
              {
                region_limit: "true",
                scope: "2",
                page_num: "0",
                page_size: "20",
                address_result: "false",
              },
            ],
          ].map(async ([endpoint, extra]) => {
            const start = performance.now();
            let http = null;
            const row = { query, region: "北京", endpoint };
            try {
              const params = new URLSearchParams({
                query,
                region: "北京",
                ret_coordtype: "gcj02ll",
                output: "json",
                ak,
                ...extra,
              });
              const response = await fetch(
                `https://api.map.baidu.com${endpoint}?${params}`,
                {
                  signal: controller.signal,
                  redirect: "error",
                  cache: "no-store",
                  headers: { "User-Agent": "qiudazi-h5/1.0" },
                },
              );
              http = response.status;
              const body = await boundedJson(response);
              const records = Array.isArray(body.results)
                ? body.results
                : Array.isArray(body.result)
                  ? body.result
                  : [];
              const valid =
                body.status === 0
                  ? records.filter(
                      (p) =>
                        p &&
                        typeof p.name === "string" &&
                        p.name.trim() &&
                        p.location &&
                        Number.isFinite(p.location.lat) &&
                        Number.isFinite(p.location.lng) &&
                        p.location.lat >= 0.8293 &&
                        p.location.lat <= 55.8271 &&
                        p.location.lng >= 72.004 &&
                        p.location.lng <= 137.8347,
                    )
                  : [];
              return {
                ...row,
                http_status: http,
                business_status: Number.isInteger(body.status)
                  ? body.status
                  : null,
                message: safeMessage(body.message, ak),
                elapsed_ms: Math.round(performance.now() - start),
                returned_count: body.status === 0 ? records.length : null,
                valid_candidate_count: valid.length,
                classification: !response.ok
                  ? `HTTP_${http}`
                  : body.status === 0
                    ? "BUSINESS_OK_QUALITY_NOT_VERIFIED"
                    : classifyBaiduTerminalStatus([body.status]) ||
                      "BAIDU_NONZERO_OR_INVALID_RESPONSE",
              };
            } catch (error) {
              return {
                ...row,
                http_status: http,
                business_status: null,
                message: "",
                elapsed_ms: Math.round(performance.now() - start),
                valid_candidate_count: 0,
                classification: controller.signal.aborted
                  ? "TIMEOUT"
                  : error.message === "RESPONSE_TOO_LARGE"
                    ? "RESPONSE_TOO_LARGE"
                    : "NETWORK_OR_INVALID_RESPONSE",
              };
            }
          }),
        )),
      );
    }
  } finally {
    clearTimeout(timer);
  }
  res.status(200).json({
    diagnostic: DIAGNOSTIC_MODE,
    checked_at: new Date().toISOString(),
    request_count: rows.length,
    rows,
  });
}
