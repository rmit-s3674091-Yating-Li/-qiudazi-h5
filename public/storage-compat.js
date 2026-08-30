// Bootstrap compatibility before any ESM dependency (including Supabase Auth)
// can probe navigator.storage. Native StorageManager implementations are kept;
// only missing methods are filled for partial WebKit implementations.
(function () {
  if (typeof navigator === "undefined") return;

  var fallback = {
    persisted: function () { return Promise.resolve(false); },
    persist: function () { return Promise.resolve(false); },
    estimate: function () { return Promise.resolve({ usage: 0, quota: 0 }); }
  };

  try {
    if (typeof navigator.storage === "undefined") {
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: fallback
      });
      return;
    }

    ["persisted", "persist", "estimate"].forEach(function (method) {
      if (typeof navigator.storage[method] !== "function") {
        try {
          Object.defineProperty(navigator.storage, method, {
            configurable: true,
            value: fallback[method]
          });
        } catch (_) {
          try { navigator.storage[method] = fallback[method]; } catch (_) {}
        }
      }
    });
  } catch (_) {
    // Leave non-configurable host objects untouched; browser blackbox will
    // surface any unsupported runtime rather than hiding it.
  }
})();
