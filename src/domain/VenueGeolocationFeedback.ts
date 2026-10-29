/** A GPS timeout or unavailable sensor must never be described as denied permission. */
export function venueGeolocationFeedback(error: unknown, en: boolean): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "GEOLOCATION_DENIED") {
    return en
      ? "Location permission was not granted. You can still drag the map manually."
      : "未获得定位权限，你仍可以手动拖动地图选点。";
  }
  if (code === "GEOLOCATION_TIMEOUT") {
    return en
      ? "Location timed out. Try again, or move the map manually."
      : "定位超时，请重试或手动拖动地图选点。";
  }
  if (code === "GEOLOCATION_UNAVAILABLE") {
    return en
      ? "Your device could not determine its location. You can still search or move the map."
      : "当前设备无法获取位置，你仍可以搜索场馆或手动拖动地图。";
  }
  return en
    ? "Location could not be determined. Try again, search, or move the map."
    : "暂时无法获取位置，请重试、搜索场馆或手动拖动地图。";
}
