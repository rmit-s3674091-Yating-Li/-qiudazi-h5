// WebKit-compatible StorageManager fallback for libraries that probe
// navigator.storage during module initialization. Native implementations are
// never replaced; only missing methods are filled for partial implementations.
if (typeof navigator !== "undefined") {
  const fallback = {
    persisted: async () => false,
    persist: async () => false,
    estimate: async () => ({ usage: 0, quota: 0 }),
  };

  try {
    if (typeof navigator.storage === "undefined") {
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: fallback,
      });
    } else {
      for (const method of ["persisted", "persist", "estimate"] as const) {
        if (typeof navigator.storage[method] !== "function") {
          try {
            Object.defineProperty(navigator.storage, method, {
              configurable: true,
              value: fallback[method],
            });
          } catch {
            try {
              (navigator.storage as StorageManager & Record<string, unknown>)[method] = fallback[method];
            } catch {
              // Leave non-configurable host methods untouched; browser blackbox
              // will surface any unsupported runtime rather than hiding it.
            }
          }
        }
      }
    }
  } catch {
    // Leave a non-configurable host object untouched.
  }
}
