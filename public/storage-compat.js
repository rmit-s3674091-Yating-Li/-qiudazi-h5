// Bootstrap compatibility before any ESM dependency (including Supabase Auth)
// can probe navigator.storage. WebKit can expose Navigator as a host object that
// rejects own-property patches, so install a stable prototype getter when the
// StorageManager surface is missing or partial. Native methods stay preferred.
(function () {
  if (typeof navigator === "undefined") return;

  var fallback = {
    persisted: function () { return Promise.resolve(false); },
    persist: function () { return Promise.resolve(false); },
    estimate: function () { return Promise.resolve({ usage: 0, quota: 0 }); }
  };

  function bindOrFallback(storage, method) {
    try {
      if (storage && typeof storage[method] === "function") {
        return storage[method].bind(storage);
      }
    } catch (_) {}
    return fallback[method];
  }

  var nativeStorage;
  try { nativeStorage = navigator.storage; } catch (_) { nativeStorage = undefined; }

  var complete = false;
  try {
    complete = !!nativeStorage &&
      typeof nativeStorage.persisted === "function" &&
      typeof nativeStorage.persist === "function" &&
      typeof nativeStorage.estimate === "function";
  } catch (_) {}
  if (complete) return;

  var facade = {
    persisted: bindOrFallback(nativeStorage, "persisted"),
    persist: bindOrFallback(nativeStorage, "persist"),
    estimate: bindOrFallback(nativeStorage, "estimate")
  };

  // Prefer the prototype because WebKit may reject defining properties directly
  // on the Navigator host object. The getter returns one stable facade so callers
  // such as Supabase Auth can safely evaluate navigator.storage.persisted.
  try {
    var proto = typeof Navigator !== "undefined" ? Navigator.prototype : Object.getPrototypeOf(navigator);
    if (proto) {
      Object.defineProperty(proto, "storage", {
        configurable: true,
        get: function () { return facade; }
      });
      return;
    }
  } catch (_) {}

  // Last-resort fallback for browsers that allow an own Navigator property.
  try {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      get: function () { return facade; }
    });
  } catch (_) {}
})();
