// WebKit-compatible StorageManager fallback for libraries that probe
// navigator.storage during module initialization. Native implementations
// are never replaced; unsupported browsers simply report non-persistent
// storage while localStorage/session behavior remains unchanged.
if (typeof navigator !== "undefined" && typeof navigator.storage === "undefined") {
  try {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persisted: async () => false,
        persist: async () => false,
        estimate: async () => ({ usage: 0, quota: 0 }),
      },
    });
  } catch {
    // If the host object is non-configurable, leave it untouched. The
    // browser blackbox will continue to surface any unsupported runtime.
  }
}
