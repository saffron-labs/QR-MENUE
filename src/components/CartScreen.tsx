"use client";

import { useState } from "react";
import { type CartLine, lineUnitPaise, optionSummary } from "@/lib/cart";
import { formatINR } from "@/lib/money";
import type { MenuItem } from "@/lib/types";
import { DishArt, Icon, Qty, Svg, shortName } from "./ui";

type Props = {
  lines: CartLine[];
  itemsById: Map<string, MenuItem>;
  gstRateBp: number;
  tableLabel: string;
  onBack: () => void;
  onQty: (key: string, qty: number) => void;
  onPlace: (details: { customerName: string; guestCount: number | undefined; notes: string }) => Promise<string | null>;
};

export const CartScreen = ({ lines, itemsById, gstRateBp, tableLabel, onBack, onQty, onPlace }: Props) => {
  const [name, setName] = useState("");
  const [guests, setGuests] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = lines.reduce((sum, l) => {
    const item = itemsById.get(l.itemId);
    return item ? sum + lineUnitPaise(item, l.optionIds) * l.qty : sum;
  }, 0);
  const tax = Math.round((subtotal * gstRateBp) / 10000);

  const place = async () => {
    setBusy(true);
    setError(null);
    const parsedGuests = Number.parseInt(guests, 10);
    const message = await onPlace({ customerName: name.trim(), guestCount: Number.isFinite(parsedGuests) ? parsedGuests : undefined, notes: notes.trim() });
    if (message) {
      setError(message);
      setBusy(false);
    }
  };

  return (
    <div className="screen relative mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-cream">
      <header className="flex items-center justify-between px-[18px] pt-[18px]">
        <button type="button" onClick={onBack} aria-label="Back to menu" className="press flex h-12 w-12 items-center justify-center rounded-2xl border border-ink/10 bg-white shadow-[0_6px_16px_rgba(80,40,10,0.08)]"><Svg>{Icon.back}</Svg></button>
        <div className="text-center">
          <h1 className="font-display text-xl font-extrabold tracking-tight">Your order</h1>
          <p className="text-[11px] font-semibold text-[#8a7c6e]">Table {tableLabel.replace(/^T-0?/, "")}</p>
        </div>
        <span className="h-12 w-12" aria-hidden="true" />
      </header>

      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="font-display text-2xl font-extrabold">Nothing here yet</p>
          <p className="text-sm text-muted">Pick a dish you like and add it to your order.</p>
          <button type="button" onClick={onBack} className="press h-12 rounded-full bg-ink px-6 text-sm font-bold text-white">Browse the menu</button>
        </div>
      ) : (
        <>
          <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-5">
            {lines.map((l) => {
              const item = itemsById.get(l.itemId);
              if (!item) return null;
              return (
                <div key={l.key} className="relative rounded-[26px] bg-ink p-3 pl-[88px] text-white">
                  <span className="absolute -left-1 -top-3 h-[92px] w-[92px] drop-shadow-[0_14px_14px_rgba(0,0,0,0.4)]"><DishArt item={item} sizes="92px" /></span>
                  <p className="font-display text-[17px] font-extrabold leading-tight">{shortName(item.name)}</p>
                  <p className="mt-0.5 line-clamp-2 min-h-4 text-xs text-white/60">{[optionSummary(item, l.optionIds), l.notes && `“${l.notes}”`].filter(Boolean).join(" · ")}</p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <p className="font-display text-lg font-extrabold text-[#ff8a5c]">{formatINR(lineUnitPaise(item, l.optionIds) * l.qty)}</p>
                    <div className="flex items-center rounded-full bg-white/10 p-1">
                      <button type="button" aria-label={`Remove one ${shortName(item.name)}`} onClick={() => onQty(l.key, l.qty - 1)} className="press flex h-8 w-8 items-center justify-center rounded-full bg-white/15"><Svg size={14} width={2.6}>{Icon.minus}</Svg></button>
                      <span className="w-7 text-center text-sm font-bold tabular-nums">{l.qty}</span>
                      <button type="button" aria-label={`Add one ${shortName(item.name)}`} onClick={() => onQty(l.key, l.qty + 1)} className="press flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink"><Svg size={14} width={2.6}>{Icon.plus}</Svg></button>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-[1fr_96px] gap-2 pt-1">
              <label className="block"><span className="mb-1 block text-xs font-bold">Your name <span className="font-medium text-[#9a8d80]">(optional)</span></span>
                <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} autoComplete="given-name" className="h-12 w-full rounded-2xl border-[1.5px] border-ink/10 bg-white px-3.5 text-sm outline-none focus:border-ember" /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold">Guests</span>
                <input value={guests} onChange={(e) => setGuests(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className="h-12 w-full rounded-2xl border-[1.5px] border-ink/10 bg-white px-3.5 text-sm outline-none focus:border-ember" /></label>
            </div>
            <label className="block"><span className="mb-1 block text-xs font-bold">Note for the kitchen</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 300))} rows={2} className="w-full resize-none rounded-2xl border-[1.5px] border-ink/10 bg-white px-3.5 py-3 text-sm outline-none focus:border-ember" /></label>
          </div>

          <div className="rounded-t-[30px] bg-white px-[22px] pb-[max(18px,env(safe-area-inset-bottom))] pt-4 shadow-[0_-14px_40px_rgba(80,40,10,0.1)]">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="font-semibold tabular-nums">{formatINR(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">GST ({gstRateBp / 100}%)</dt><dd className="font-semibold tabular-nums">{formatINR(tax)}</dd></div>
              <div className="flex items-baseline justify-between pt-1"><dt className="font-bold">Total</dt><dd className="font-display text-2xl font-extrabold tabular-nums">{formatINR(subtotal + tax)}</dd></div>
            </dl>
            {error && <p role="alert" className="mt-3 rounded-2xl bg-[#fdecea] px-3.5 py-2.5 text-sm font-semibold text-[#b3261e]">{error}</p>}
            <button type="button" onClick={place} disabled={busy} className="press mt-3 flex h-14 w-full items-center justify-center rounded-full bg-ember text-[15px] font-bold text-white shadow-[0_12px_24px_rgba(228,87,46,0.35)] disabled:opacity-60">
              {busy ? "Placing your order…" : "Place order"}
            </button>
            <p className="mt-2 text-center text-xs text-[#9a8d80]">Pay at the counter when you’re done.</p>
          </div>
        </>
      )}
    </div>
  );
};

export { Qty };
