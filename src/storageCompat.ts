// WebKit-compatible StorageManager fallback for libraries that probe
// navigator.storage during module initialization. Native implementations are
// never replaced; only missing methods are filled for partial implementations.
if (typeof navigator !== "undefined") {
  const fallback = {
    persisted: async () => false,
    persist: async () => false,
    estimate: async (): Promise<StorageEstimate> => ({ usage: 0, quota: 0 }),
  };

  const patchMissingMethod = (target: object, method: string, value: unknown) => {
    try {
      Object.defineProperty(target, method, {
        configurable: true,
        value,
      });
    } catch {
      try {
        (target as unknown as Record<string, unknown>)[method] = value;
      } catch {
        // Leave non-configurable host methods untouched; browser blackbox
        // will surface any unsupported runtime rather than hiding it.
      }
    }
  };

  try {
    if (typeof navigator.storage === "undefined") {
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: fallback,
      });
    } else {
      if (typeof navigator.storage.persisted !== "function") {
        patchMissingMethod(navigator.storage, "persisted", fallback.persisted);
      }
      if (typeof navigator.storage.persist !== "function") {
        patchMissingMethod(navigator.storage, "persist", fallback.persist);
      }
      if (typeof navigator.storage.estimate !== "function") {
        patchMissingMethod(navigator.storage, "estimate", fallback.estimate);
      }
    }
  } catch {
    // Leave a non-configurable host object untouched.
  }
}
