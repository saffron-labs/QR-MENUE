"use client";

import { useState } from "react";
import { setOrderStatus, type StaffOrder } from "@/lib/staff";
import type { OrderStatus } from "@/lib/types";
import { SoldOutPanel } from "./SoldOutPanel";
import { PinGate } from "./PinGate";
import { ageLabel, beep, minutesSince, modifierText, useNewOrderAlert, useNow } from "./common";
import { useStaff } from "./useStaff";

const COLS: { status: OrderStatus; title: string; action?: { label: string; to: OrderStatus } }[] = [
  { status: "placed", title: "New", action: { label: "Start cooking", to: "preparing" } },
  { status: "preparing", title: "Cooking", action: { label: "Mark ready", to: "ready" } },
  { status: "ready", title: "Ready · waiting for server" },
];

export const KitchenBoard = ({ slug, restaurantName }: { slug: string; restaurantName: string }) => {
  const s = useStaff(slug, "kitchen");
  const now = useNow();
  const [sound, setSound] = useState(false);
  const [showSoldOut, setShowSoldOut] = useState(false);
  const [tab, setTab] = useState<OrderStatus>("placed");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  useNewOrderAlert(s.board?.orders, (o) => o.status === "placed", () => sound && beep());

  if (!s.checked) return null;
  if (!s.pin) return <PinGate title="Kitchen" subtitle={`${restaurantName} · enter the kitchen PIN`} error={s.error} onSubmit={s.login} />;

  const orders = s.board?.orders ?? [];
  const toCook = Object.entries(
    orders.filter((o) => o.status === "placed" || o.status === "preparing").flatMap((o) => o.items).reduce<Record<string, number>>((acc, it) => ({ ...acc, [it.name]: (acc[it.name] ?? 0) + it.qty }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const move = async (o: StaffOrder, to: OrderStatus) => {
    setBusy(o.id);
    setActionErr(null);
    try {
      await setOrderStatus(slug, s.pin!, "kitchen", o.id, to);
      await s.refresh();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not update the order");
    }
    setBusy(null);
  };

  return (
    <div className="min-h-dvh bg-[#14100c] text-white">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#14100c]/95 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Kitchen</h1>
          <p className="text-xs text-white/50">{restaurantName} · {orders.filter((o) => o.status === "placed").length} new · {orders.filter((o) => o.status === "preparing").length} cooking{s.offline ? " · reconnecting…" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-pressed={sound} onClick={() => { setSound(!sound); if (!sound) beep(); }} className={`press h-11 rounded-full px-4 text-sm font-bold ${sound ? "bg-emerald-500 text-black" : "bg-white/10"}`}>{sound ? "Sound on" : "Sound off"}</button>
          <button type="button" onClick={() => setShowSoldOut(true)} className="press h-11 rounded-full bg-white/10 px-4 text-sm font-bold">Sold out</button>
          <button type="button" onClick={s.logout} className="press h-11 rounded-full bg-white/10 px-4 text-sm font-bold">Lock</button>
        </div>
      </header>

      <nav className="flex gap-2 px-4 pt-3 lg:hidden" aria-label="Order stage">
        {COLS.map((c) => (
          <button key={c.status} type="button" aria-pressed={tab === c.status} onClick={() => setTab(c.status)} className={`press h-11 flex-1 rounded-full text-sm font-bold ${tab === c.status ? "bg-ember" : "bg-white/10"}`}>
            {c.title.split(" ")[0]} ({orders.filter((o) => o.status === c.status).length})
          </button>
        ))}
      </nav>

      {toCook.length > 0 && (
        <section aria-label="To cook" className="mx-4 mt-3 flex items-center gap-2 overflow-x-auto rounded-2xl bg-white/5 px-3 py-2">
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-white/50">To cook</span>
          {toCook.map(([name, qty]) => (
            <span key={name} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold"><span className="font-extrabold text-ember">{qty}×</span> {name}</span>
          ))}
        </section>
      )}

      {actionErr && <p role="alert" className="mx-4 mt-3 rounded-xl bg-ember/20 px-4 py-2 text-sm font-semibold text-ember">{actionErr}</p>}

      <main className="grid gap-4 p-4 lg:grid-cols-3">
        {COLS.map((c) => {
          const list = orders.filter((o) => o.status === c.status).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return (
            <section key={c.status} aria-label={c.title} className={`${tab === c.status ? "block" : "hidden"} lg:block`}>
              <h2 className="mb-3 hidden items-center gap-2 text-sm font-bold uppercase tracking-wide text-white/60 lg:flex">{c.title}<span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white">{list.length}</span></h2>
              {list.length === 0 && <p className="rounded-2xl border border-dashed border-white/15 py-10 text-center text-sm text-white/40">Nothing here</p>}
              <div className="flex flex-col gap-3">
                {list.map((o) => {
                  const m = minutesSince(o.createdAt, now);
                  const late = c.status !== "ready" && m >= 15;
                  const warn = c.status !== "ready" && m >= 8;
                  return (
                    <article key={o.id} className={`overflow-hidden rounded-3xl border-l-8 p-4 ${late ? "border-ember bg-[#4a1d12]" : warn ? "border-amber-400 bg-[#2b2218]" : c.status === "ready" ? "border-emerald-500 bg-[#1b2a22]" : "border-white/15 bg-[#241d17]"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-display text-3xl font-extrabold leading-none">#{o.number}</p>
                          <p className="mt-1 text-sm font-semibold text-white/70">Table {o.table.replace(/^T-0?/, "")}{o.guests ? ` · ${o.guests} guests` : ""}{o.customer ? ` · ${o.customer}` : ""}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-sm font-bold ${late ? "bg-ember text-white" : warn ? "bg-amber-400 text-black" : "bg-white/10"}`}>{ageLabel(m)}</span>
                      </div>
                      <ul className="mt-3 flex flex-col gap-2">
                        {o.items.map((it, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="font-display text-2xl font-extrabold leading-tight text-ember">{it.qty}×</span>
                            <div>
                              <p className="text-lg font-bold leading-tight">{it.name}</p>
                              {it.modifiers.length > 0 && <p className="text-sm text-white/60">{modifierText(it.modifiers)}</p>}
                              {it.notes && <p className="mt-0.5 text-sm font-semibold text-amber-300">Note: {it.notes}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                      {o.notes && <p className="mt-3 rounded-xl bg-amber-400/15 px-3 py-2 text-sm font-semibold text-amber-300">Order note: {o.notes}</p>}
                      <div className="mt-4 flex gap-2">
                        {c.action && (
                          <button type="button" disabled={busy === o.id} onClick={() => move(o, c.action!.to)} className="press h-14 flex-1 rounded-full bg-ember text-base font-bold disabled:opacity-50">{c.action.label}</button>
                        )}
                        {c.status !== "placed" && (
                          <button type="button" disabled={busy === o.id} onClick={() => move(o, c.status === "ready" ? "preparing" : "placed")} className="press h-14 rounded-full bg-white/10 px-5 text-sm font-bold disabled:opacity-50">Undo</button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>

      {showSoldOut && <SoldOutPanel slug={slug} pin={s.pin} role="kitchen" dark onClose={() => setShowSoldOut(false)} />}
    </div>
  );
};
