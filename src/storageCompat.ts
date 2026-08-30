// WebKit-compatible StorageManager fallback for libraries that probe
// navigator.storage during module initialization. Native implementations are
// never replaced when complete; only missing methods are filled for partial
// implementations.
if (typeof navigator !== "undefined") {
  const fallback = {
    persisted: async () => false,
    persist: async () => false,
    estimate: async (): Promise<StorageEstimate> => ({ usage: 0, quota: 0 }),
  };

  type CompatMethod = keyof typeof fallback;

  const patchMethod = (target: object, method: CompatMethod) => {
    try {
      Object.defineProperty(target, method, {
        configurable: true,
        value: fallback[method],
      });
      return true;
    } catch {
      try {
        (target as Record<CompatMethod, unknown>)[method] = fallback[method];
        return true;
      } catch {
        return false;
      }
    }
  };

  const hasMethod = (storage: StorageManager, method: CompatMethod) =>
    typeof (storage as unknown as Record<CompatMethod, unknown>)[method] === "function";

  try {
    if (typeof navigator.storage === "undefined") {
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: fallback,
      });
    } else {
      const storage = navigator.storage;
      const prototype = Object.getPrototypeOf(storage) as object | null;

      // WebKit StorageManager instances can be non-extensible host objects.
      // Patch the prototype first so all instances see the missing API, then
      // fall back to the instance for browsers where that is permitted.
      for (const method of Object.keys(fallback) as CompatMethod[]) {
        if (hasMethod(storage, method)) continue;
        if (prototype) patchMethod(prototype, method);
        if (!hasMethod(storage, method)) patchMethod(storage, method);
      }

      // Some WebKit host objects reject both prototype and instance writes.
      // In that case, shadow navigator.storage with a transparent proxy that
      // preserves every native property/method and supplies only missing APIs.
      const stillMissing = (Object.keys(fallback) as CompatMethod[]).some(
        (method) => !hasMethod(storage, method),
      );

      if (stillMissing) {
        const facade = new Proxy(storage, {
          get(target, property) {
            if (property in fallback) {
              const method = property as CompatMethod;
              const nativeValue = Reflect.get(target, property, target);
              if (typeof nativeValue !== "function") return fallback[method];
              return nativeValue.bind(target);
            }

            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });

        try {
          Object.defineProperty(navigator, "storage", {
            configurable: true,
            value: facade,
          });
        } catch {
          // Leave the host object untouched. Browser blackbox remains the
          // independent authority for unsupported runtimes.
        }
      }
    }
  } catch {
    // Never let a compatibility probe prevent the application from starting.
  }
}
