"use client";

import { useCallback, useEffect, useState } from "react";

/** Runs a loader on mount and whenever it changes (pass a useCallback-wrapped loader); exposes reload. */
export const useLoad = <T,>(run: () => Promise<T>, onAuthError: () => void) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (/PIN|Too many/i.test(msg)) onAuthError();
      else setError(msg);
    }
  }, [run, onAuthError]);
  useEffect(() => {
    const t = setTimeout(reload, 0);
    return () => clearTimeout(t);
  }, [reload]);
  return { data, error, reload };
};
