import { useCallback, useEffect, useRef, useState } from "react";
import { explainError } from "../repositories/supabase";

type CacheEntry = { data: unknown; updatedAt: number };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
const DEFAULT_STALE_MS = 30_000;

export function invalidateQuery(key: string) {
  cache.delete(key);
}

export function useQuery<T>(key: string, load: () => Promise<T>, interval = 0) {
  const ref = useRef(load);
  ref.current = load;
  const cached = cache.get(key);
  const [data, setData] = useState<T | null>(() => (cached?.data as T | undefined) ?? null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(!cached);
  const requestId = useRef(0);

  const refresh = useCallback(async (force = true) => {
    const id = ++requestId.current;
    const existing = cache.get(key);
    const staleMs = interval || DEFAULT_STALE_MS;
    if (!force && existing && Date.now() - existing.updatedAt < staleMs) {
      setData(existing.data as T);
      setLoading(false);
      return existing.data as T;
    }

    if (!existing) setLoading(true);
    try {
      let pending = inFlight.get(key) as Promise<T> | undefined;
      if (!pending) {
        pending = ref.current();
        inFlight.set(key, pending);
      }
      const result = await pending;
      cache.set(key, { data: result, updatedAt: Date.now() });
      if (id === requestId.current) {
        setData(result);
        setError("");
      }
      return result;
    } catch (e) {
      if (id === requestId.current) setError(explainError(e));
      throw e;
    } finally {
      inFlight.delete(key);
      if (id === requestId.current) setLoading(false);
    }
  }, [key, interval]);

  useEffect(() => {
    const existing = cache.get(key);
    if (existing) {
      setData(existing.data as T);
      setLoading(false);
    }
    void refresh(false).catch(() => {});

    let lastFocusRefresh = 0;
    const focus = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastFocusRefresh < 1000) return;
      lastFocusRefresh = now;
      void refresh(false).catch(() => {});
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const timer = interval
      ? window.setInterval(() => {
          if (!document.hidden) void refresh(false).catch(() => {});
        }, interval)
      : null;
    return () => {
      requestId.current++;
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      if (timer) clearInterval(timer);
    };
  }, [refresh, interval, key]);

  return { data, error, loading, refresh: () => refresh(true) };
}
