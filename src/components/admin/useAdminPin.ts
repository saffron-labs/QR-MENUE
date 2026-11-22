"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVT = "chackos-admin-pin";
const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
};

/** Admin PIN kept for this browser tab only. `undefined` until the client has read storage. */
export const useAdminPin = (slug: string) => {
  const key = `chackos:${slug}:admin:pin`;
  const stored = useSyncExternalStore(
    subscribe,
    () => { try { return sessionStorage.getItem(key); } catch { return null; } },
    () => undefined,
  );
  const setPin = useCallback((value: string | null) => {
    try {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    } catch {}
    window.dispatchEvent(new Event(EVT));
  }, [key]);
  return { pin: stored ?? null, ready: stored !== undefined, setPin };
};
