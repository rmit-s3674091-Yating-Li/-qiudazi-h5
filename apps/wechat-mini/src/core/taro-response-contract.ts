/**
 * Offline boundary for untrusted Taro request/uploadFile response envelopes.
 * Reject malformed status and accessor-backed fields without reading them.
 * This is not proof of redirect handling, Supabase wire compatibility, RLS,
 * server-side persistence, or a real authenticated WeChat session.
 */
const MAX_UPLOAD_RESPONSE_BYTES = 256 * 1024;

/**
 * Count UTF-8 bytes without Buffer/TextEncoder, which are not guaranteed in
 * the WeChat runtime. Reject malformed UTF-16 rather than silently replacing
 * lone surrogates, and stop as soon as the response exceeds the limit.
 */
function boundedUtf8Body(body: string): boolean {
  let bytes = 0;
  for (let index = 0; index < body.length; index++) {
    const unit = body.charCodeAt(index);
    if (unit <= 0x7f) bytes += 1;
    else if (unit <= 0x7ff) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      if (++index >= body.length) return false;
      const low = body.charCodeAt(index);
      if (low < 0xdc00 || low > 0xdfff) return false;
      bytes += 4;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    else bytes += 3;
    if (bytes > MAX_UPLOAD_RESPONSE_BYTES) return false;
  }
  return true;
}

function ownData(response: unknown, key: "statusCode" | "data"): unknown {
  try {
    if (!response || typeof response !== "object" || Array.isArray(response))
      throw new Error("INVALID_TARO_RESPONSE");
    const descriptor = Object.getOwnPropertyDescriptor(response, key);
    if (!descriptor || !("value" in descriptor))
      throw new Error("INVALID_TARO_RESPONSE");
    return descriptor.value;
  } catch {
    // Never include platform messages, URLs, response bodies or credentials.
    throw new Error("INVALID_TARO_RESPONSE");
  }
}

function statusCode(response: unknown): number {
  const status = ownData(response, "statusCode");
  if (
    typeof status !== "number" ||
    !Number.isSafeInteger(status) ||
    status < 200 ||
    status > 599 ||
    (status >= 300 && status < 400)
  ) {
    // A visible redirect cannot be treated as a successful bearer response.
    // The platform may already have followed a redirect: G2 must test that.
    throw new Error("INVALID_TARO_RESPONSE");
  }
  return status;
}

/** HTTP 4xx/5xx remain visible to the caller; never convert them to success. */
export function parseTaroRequestResponse<T>(
  response: unknown,
): Readonly<{ status: number; data: T }> {
  const status = statusCode(response);
  const data = ownData(response, "data") as T;
  return { status, data };
}

/** uploadFile documents a string body; cap it before passing it upstream. */
export function parseTaroUploadResponse(
  response: unknown,
): Readonly<{ status: number; rawBody: string }> {
  const status = statusCode(response);
  const body = ownData(response, "data");
  if (typeof body !== "string" || !boundedUtf8Body(body))
    throw new Error("INVALID_TARO_RESPONSE");
  return { status, rawBody: body };
}
