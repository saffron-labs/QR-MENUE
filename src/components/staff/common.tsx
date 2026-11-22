"use client";

import { useEffect, useRef, useState } from "react";
import type { StaffOrder } from "@/lib/staff";

export const useNow = (ms = 15000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
};

export const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
export const ageLabel = (m: number) => (m < 1 ? "just now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} m`);

/** Plain-language summary of what a guest chose for an item, e.g. "Rumali Roti · Extra dips: Garlic Mayo". */
export const modifierText = (mods: StaffOrder["items"][number]["modifiers"]) =>
  Object.entries(
    mods.reduce<Record<string, string[]>>((acc, m) => {
      (acc[m.group] ||= []).push(m.option);
      return acc;
    }, {}),
  )
    .map(([g, opts]) => `${g}: ${opts.join(", ")}`)
    .join(" · ");

/** Short double beep when a new order shows up. Browsers only allow sound after a tap, hence the enable toggle. */
export const beep = () => {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.22].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {}
};

/** Calls `onNew` when an order id appears that was not in the previous poll (never on first load). */
export const useNewOrderAlert = (orders: StaffOrder[] | undefined, match: (o: StaffOrder) => boolean, onNew: () => void) => {
  const seen = useRef<Set<string> | null>(null);
  const latest = useRef({ match, onNew });
  useEffect(() => {
    latest.current = { match, onNew };
  });
  useEffect(() => {
    if (!orders) return;
    const ids = new Set(orders.filter(latest.current.match).map((o) => o.id));
    if (seen.current && [...ids].some((id) => !seen.current!.has(id))) latest.current.onNew();
    seen.current = ids;
  }, [orders]);
};
