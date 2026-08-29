import { useCallback, useEffect, useRef, useState } from "react";
import { explainError } from "../repositories/supabase";
export function useQuery<T>(key: string, load: () => Promise<T>, interval = 0) {
  const ref = useRef(load);
  ref.current = load;
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await ref.current();
      if (id === requestId.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (id === requestId.current) setError(explainError(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [key]);
  useEffect(() => {
    setData(null);
    refresh();
    const focus = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const timer = interval ? window.setInterval(focus, interval) : null;
    return () => {
      requestId.current++;
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      if (timer) clearInterval(timer);
    };
  }, [refresh, interval]);
  return { data, error, loading, refresh };
}
