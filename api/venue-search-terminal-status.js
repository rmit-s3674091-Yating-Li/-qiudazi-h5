/** Baidu official business status codes. Do not retry other aliases for a key-wide failure. */
export function classifyBaiduTerminalStatus(statuses) {
  const codes = new Set(
    (Array.isArray(statuses) ? statuses : []).filter(Number.isInteger),
  );
  if (codes.has(240)) return "BAIDU_PLACE_PERMISSION_DENIED";
  if (
    [3, 5, 9, 101, 200, 201, 202, 203, 210, 211, 220, 230].some((code) =>
      codes.has(code),
    )
  )
    return "BAIDU_PLACE_APP_CONFIGURATION_ERROR";
  if ([260, 261].some((code) => codes.has(code)))
    return "BAIDU_PLACE_SERVICE_UNAVAILABLE";
  if ([4, 301, 302].some((code) => codes.has(code)))
    return "BAIDU_PLACE_QUOTA_EXCEEDED";
  if ([401, 402].some((code) => codes.has(code)))
    return "BAIDU_PLACE_CONCURRENCY_LIMIT";
  return null;
}
