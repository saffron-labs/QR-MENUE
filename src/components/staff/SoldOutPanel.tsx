"use client";

import { useEffect, useState } from "react";
import { fetchStaffMenu, setAvailable, type StaffMenuItem, type StaffRole } from "@/lib/staff";

type Props = { slug: string; pin: string; role: StaffRole; onClose: () => void; dark?: boolean };

export const SoldOutPanel = ({ slug, pin, role, onClose, dark = false }: Props) => {
  const [items, setItems] = useState<StaffMenuItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchStaffMenu(slug, pin, role).then((r) => setItems(r.items)).catch((e) => setErr(e.message));
  }, [slug, pin, role]);

  const toggle = async (it: StaffMenuItem) => {
    const next = !it.available;
    setItems((prev) => prev && prev.map((x) => (x.id === it.id ? { ...x, available: next } : x)));
    try {
      await setAvailable(slug, pin, role, it.id, next);
    } catch (e) {
      setItems((prev) => prev && prev.map((x) => (x.id === it.id ? { ...x, available: it.available } : x)));
      setErr(e instanceof Error ? e.message : "Could not update");
    }
  };

  const groups = (items ?? []).reduce<Record<string, StaffMenuItem[]>>((acc, i) => ((acc[i.category] ||= []).push(i), acc), {});
  const panel = dark ? "bg-[#1f1914] text-white" : "bg-cream text-ink";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Sold out dishes">
      <div className={`flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl p-5 sm:rounded-3xl ${panel}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-extrabold">Sold out dishes</h2>
            <p className="text-xs opacity-60">Switch a dish off and guests see “Sold out” right away.</p>
          </div>
          <button type="button" onClick={onClose} className="press h-11 rounded-full bg-white/10 px-4 text-sm font-bold">Done</button>
        </div>
        {err && <p role="alert" className="mt-2 text-sm font-semibold text-ember">{err}</p>}
        <div className="mt-3 flex-1 overflow-y-auto">
          {!items && !err && <p className="py-8 text-center text-sm opacity-60">Loading…</p>}
          {Object.entries(groups).map(([cat, list]) => (
            <section key={cat} className="mb-3">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide opacity-50">{cat}</h3>
              {list.map((it) => (
                <button key={it.id} type="button" role="switch" aria-checked={it.available} onClick={() => toggle(it)} className="press flex min-h-12 w-full items-center justify-between gap-3 border-b border-white/10 py-2 text-left">
                  <span className={`text-[15px] font-semibold ${it.available ? "" : "line-through opacity-50"}`}>{it.name}</span>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${it.available ? "bg-emerald-500/20 text-emerald-500" : "bg-ember/20 text-ember"}`}>{it.available ? "Available" : "Sold out"}</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
