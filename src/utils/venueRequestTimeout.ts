/** Bound venue provider calls so a stalled fetch or JSON body cannot block selection. */
export async function withVenueRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 8000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => request(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("VENUE_PROVIDER_TIMEOUT"));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
