"use client";

import { useState } from "react";
import { formatINR } from "@/lib/money";
import { setOrderStatus, type StaffOrder } from "@/lib/staff";
import type { OrderStatus } from "@/lib/types";
import { SoldOutPanel } from "./SoldOutPanel";
import { PinGate } from "./PinGate";
import { ageLabel, beep, minutesSince, modifierText, useNewOrderAlert, useNow } from "./common";
import { useStaff } from "./useStaff";

const label = (t: string) => t.replace(/^T-0?/, "T");

export const AttendantBoard = ({ slug, restaurantName }: { slug: string; restaurantName: string }) => {
  const s = useStaff(slug, "attendant");
  const now = useNow();
  const [sound, setSound] = useState(false);
  const [showSoldOut, setShowSoldOut] = useState(false);
  const [tableFilter, setTableFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  useNewOrderAlert(s.board?.orders, (o) => o.status === "ready", () => sound && beep());

  if (!s.checked) return null;
  if (!s.pin) return <PinGate title="Attendant" subtitle={`${restaurantName} · enter the staff PIN`} error={s.error} onSubmit={s.login} />;

  const all = s.board?.orders ?? [];
  const orders = tableFilter ? all.filter((o) => o.table === tableFilter) : all;
  const by = (...st: OrderStatus[]) => orders.filter((o) => st.includes(o.status));
  const tableState = (t: string) => {
    const os = all.filter((o) => o.table === t);
    if (os.some((o) => o.status === "ready")) return "ready";
    if (os.some((o) => o.status === "placed" || o.status === "preparing")) return "busy";
    if (os.some((o) => o.status === "served")) return "served";
    return "free";
  };
  const tableStyle = { ready: "bg-emerald-500 text-black", busy: "bg-ember text-white", served: "bg-peach text-ink", free: "bg-white text-ink/60" } as const;

  const move = async (o: StaffOrder, to: OrderStatus) => {
    setBusy(o.id);
    setActionErr(null);
    try {
      await setOrderStatus(slug, s.pin!, "attendant", o.id, to);
      await s.refresh();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not update the order");
    }
    setBusy(null);
    setConfirmCancel(null);
  };

  const renderCard = (o: StaffOrder) => {
    const m = minutesSince(o.createdAt, now);
    return (
      <article key={o.id} className={`rounded-3xl border p-4 ${o.status === "ready" ? "border-emerald-500 bg-emerald-50" : "border-ink/10 bg-white"} ${o.status === "cancelled" ? "opacity-60" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-2xl font-extrabold leading-none">Table {o.table.replace(/^T-0?/, "")} <span className="text-base font-bold text-muted">#{o.number}</span></p>
            <p className="mt-1 text-sm text-muted">{o.customer ? `${o.customer} · ` : ""}{o.guests ? `${o.guests} guests · ` : ""}{ageLabel(m)} ago · {formatINR(o.totalPaise)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${o.status === "ready" ? "bg-emerald-500 text-black" : o.status === "preparing" ? "bg-amber-300" : o.status === "cancelled" ? "bg-ink/10" : o.status === "served" ? "bg-peach" : "bg-ember/15 text-ember"}`}>
            {o.status === "placed" ? "Sent to kitchen" : o.status === "preparing" ? "Cooking" : o.status === "ready" ? "Ready to serve" : o.status}
          </span>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 text-[15px]">
          {o.items.map((it, i) => (
            <li key={i}>
              <span className="font-bold">{it.qty}× {it.name}</span>
              {it.modifiers.length > 0 && <span className="block text-xs text-muted">{modifierText(it.modifiers)}</span>}
              {it.notes && <span className="block text-xs font-semibold text-ember">Note: {it.notes}</span>}
            </li>
          ))}
        </ul>
        {o.notes && <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-sm font-semibold">Order note: {o.notes}</p>}
        <div className="mt-3 flex gap-2">
          {o.status === "ready" && <button type="button" disabled={busy === o.id} onClick={() => move(o, "served")} className="press h-13 min-h-12 flex-1 rounded-full bg-ink text-base font-bold text-white disabled:opacity-50">Mark served</button>}
          {o.status === "served" && <button type="button" disabled={busy === o.id} onClick={() => move(o, "ready")} className="press min-h-11 rounded-full bg-cream px-5 text-sm font-bold">Undo served</button>}
          {o.status === "cancelled" && <button type="button" disabled={busy === o.id} onClick={() => move(o, "placed")} className="press min-h-11 rounded-full bg-cream px-5 text-sm font-bold">Restore order</button>}
          {(o.status === "placed" || o.status === "preparing" || o.status === "ready") &&
            (confirmCancel === o.id ? (
              <>
                <button type="button" disabled={busy === o.id} onClick={() => move(o, "cancelled")} className="press min-h-12 rounded-full bg-ember px-5 text-sm font-bold text-white">Yes, cancel order</button>
                <button type="button" onClick={() => setConfirmCancel(null)} className="press min-h-12 rounded-full bg-cream px-5 text-sm font-bold">Keep</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmCancel(o.id)} className="press min-h-12 rounded-full bg-cream px-5 text-sm font-bold text-muted">Cancel</button>
            ))}
        </div>
      </article>
    );
  };

  const renderSection = (title: string, list: StaffOrder[], hint: string) => (
    <section key={title} aria-label={title}>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{title} ({list.length})</h2>
      {list.length === 0 ? <p className="rounded-2xl border border-dashed border-ink/15 py-6 text-center text-sm text-muted">{hint}</p> : <div className="flex flex-col gap-3">{list.map(renderCard)}</div>}
    </section>
  );

  return (
    <div className="mx-auto min-h-dvh max-w-6xl pb-10">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-cream/95 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Attendant</h1>
          <p className="text-xs text-muted">{restaurantName}{s.offline ? " · reconnecting…" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-pressed={sound} onClick={() => { setSound(!sound); if (!sound) beep(); }} className={`press h-11 rounded-full px-4 text-sm font-bold ${sound ? "bg-emerald-500" : "bg-white"}`}>{sound ? "Sound on" : "Sound off"}</button>
          <button type="button" onClick={() => setShowSoldOut(true)} className="press h-11 rounded-full bg-white px-4 text-sm font-bold">Sold out</button>
          <button type="button" onClick={s.logout} className="press h-11 rounded-full bg-white px-4 text-sm font-bold">Lock</button>
        </div>
      </header>

      <div className="px-4">
        <p className="mb-2 text-xs font-semibold text-muted">Tables · <span className="text-emerald-600">green</span> ready to serve · <span className="text-ember">orange</span> in kitchen · tap to filter</p>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-7 lg:grid-cols-14">
          {(s.board?.tables ?? []).map((t) => (
            <button key={t.id} type="button" aria-pressed={tableFilter === t.label} onClick={() => setTableFilter(tableFilter === t.label ? null : t.label)} className={`press h-12 rounded-2xl text-sm font-bold ${tableStyle[tableState(t.label)]} ${tableFilter === t.label ? "ring-2 ring-ink" : ""}`}>
              {label(t.label)}
            </button>
          ))}
        </div>
        {actionErr && <p role="alert" className="mt-3 rounded-xl bg-ember/15 px-4 py-2 text-sm font-semibold text-ember">{actionErr}</p>}
        <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:items-start">
          {renderSection("Ready to serve", by("ready"), "Nothing waiting. New dishes appear here the moment the kitchen marks them ready.")}
          {renderSection("In the kitchen", by("placed", "preparing"), "No orders cooking.")}
          <div className="lg:col-span-2">{renderSection("Served or cancelled · last 45 min", by("served", "cancelled"), "Nothing yet.")}</div>
        </div>
      </div>

      {showSoldOut && <SoldOutPanel slug={slug} pin={s.pin} role="attendant" onClose={() => setShowSoldOut(false)} />}
    </div>
  );
};
