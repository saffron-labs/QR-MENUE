"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { fetchBoard, type StaffBoard, type StaffRole } from "@/lib/staff";

const POLL_MS = 3000;
const EVT = "chackos-staff-pin";

const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
};

/** PIN kept for the browser tab only (sessionStorage), and a polling board. */
export const useStaff = (slug: string, role: StaffRole) => {
  const key = `chackos:${slug}:${role}:pin`;
  // undefined on the server / first render, then the stored PIN or null.
  const stored = useSyncExternalStore(
    subscribe,
    () => {
      try { return sessionStorage.getItem(key); } catch { return null; }
    },
    () => undefined,
  );
  const checked = stored !== undefined;
  const pin = stored ?? null;
  const [board, setBoard] = useState<StaffBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const store = useCallback((value: string | null) => {
    try {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    } catch {}
    window.dispatchEvent(new Event(EVT));
  }, [key]);

  const refresh = useCallback(async () => {
    if (!pin) return;
    try {
      const b = await fetchBoard(slug, pin, role);
      setBoard(b);
      setOffline(false);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (/PIN|Too many/i.test(msg)) {
        setBoard(null);
        setError(msg);
        store(null);
      } else {
        setOffline(true);
      }
    }
  }, [slug, role, pin, store]);

  const login = async (value: string) => {
    setError(null);
    try {
      setBoard(await fetchBoard(slug, value, role));
      store(value);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    }
  };

  const logout = () => {
    setBoard(null);
    store(null);
  };

  useEffect(() => {
    if (!pin) return;
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [pin, refresh]);

  return { pin, checked, board, error, offline, login, logout, refresh };
};
