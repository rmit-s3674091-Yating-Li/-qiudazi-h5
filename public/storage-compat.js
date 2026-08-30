// Bootstrap compatibility before any ESM dependency (including Supabase Auth)
// can probe navigator.storage. Native StorageManager implementations are kept.
(function () {
  if (typeof navigator === "undefined" || typeof navigator.storage !== "undefined") return;
  try {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persisted: function () { return Promise.resolve(false); },
        persist: function () { return Promise.resolve(false); },
        estimate: function () { return Promise.resolve({ usage: 0, quota: 0 }); }
      }
    });
  } catch (_) {
    // Leave a non-configurable host object untouched; browser blackbox will
    // surface the unsupported runtime rather than hiding it.
  }
})();
