import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useSession } from "../auth/session";
import { errorMessage } from "../api/client";

/**
 * Loads data with the session token, reloads whenever the screen regains
 * focus, and exposes pull-to-refresh state. The base of every viewmodel.
 */
export function useQuery<T>(load: (token: string) => Promise<T>, deps: unknown[] = []) {
  const { token } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(
    async (mode: "initial" | "refresh" | "silent") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        setData(await loadRef.current(token));
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, ...deps],
  );

  useFocusEffect(
    useCallback(() => {
      void run(data === null ? "initial" : "silent");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run]),
  );

  return {
    data,
    setData,
    error,
    loading: loading && data === null,
    refreshing,
    refresh: () => run("refresh"),
    reload: () => run("silent"),
  };
}

/** Wraps an async action with busy and error state. */
export function useAction<A extends unknown[], R>(fn: (token: string, ...args: A) => Promise<R>) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (!token) return undefined;
      setBusy(true);
      setError(null);
      try {
        return await fn(token, ...args);
      } catch (err) {
        setError(errorMessage(err));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [token, fn],
  );
  return { run, busy, error, setError };
}
