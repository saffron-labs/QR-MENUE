"use client";

import { useState } from "react";
import { formatINR } from "@/lib/money";
import { type SessionView, requestBill } from "@/lib/session";
import type { Credentials } from "@/lib/session";
import { Icon, Svg } from "@/components/ui";

type Props = { view: SessionView; creds: Credentials; onBack: () => void; onRefresh: () => Promise<void> };
type Split = "person" | "equal" | "one";

const STATUS_LABEL = { placed: "Sent", preparing: "Cooking", ready: "Ready", served: "Served", cancelled: "Cancelled" } as const;
const short = (n: string) => n.replace(/\s*\(.*?\)\s*$/, "");

export const TableScreen = ({ view, creds, onBack, onRefresh }: Props) => {
  const [split, setSplit] = useState<Split>("person");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const live = view.orders.filter((o) => o.status !== "cancelled");
  const total = live.reduce((s, o) => s + o.totalPaise, 0);
  const subtotal = live.reduce((s, o) => s + o.subtotalPaise, 0);
  const tax = live.reduce((s, o) => s + o.taxPaise, 0);
  const perGuest = view.guests.map((g) => ({ g, orders: view.orders.filter((o) => o.guestId === g.id), total: live.filter((o) => o.guestId === g.id).reduce((s, o) => s + o.totalPaise, 0) }));
  const cgst = Math.round(tax / 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(view.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the code is on screen */ }
  };
  const share = async () => {
    const text = `Join our table at ${view.restaurant.name}: scan the QR on the table and enter code ${view.code}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
    } catch { /* cancelled */ }
  };
  const ask = async () => {
    setBusy(true);
    try { await requestBill(creds); await onRefresh(); } finally { setBusy(false); }
  };

  const lines =
    split === "person" ? perGuest.map((p) => ({ key: p.g.id, name: p.g.name, detail: "Own items + GST", amount: p.total }))
    : split === "equal" ? view.guests.map((g, i) => ({ key: g.id, name: g.name, detail: `1 of ${view.guests.length} equal shares`, amount: Math.floor(total / view.guests.length) + (i < total % view.guests.length ? 1 : 0) }))
    : [{ key: "all", name: "Whole table", detail: `${view.guests.length} guest${view.guests.length === 1 ? "" : "s"} · one payment`, amount: total }];

  return (
    <div className="screen mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-cream">
      <header className="flex items-center justify-between px-[18px] pt-[18px]">
        <button type="button" onClick={onBack} aria-label="Back to menu" className="press flex h-12 w-12 items-center justify-center rounded-2xl border border-ink/10 bg-white shadow-[0_6px_16px_rgba(80,40,10,0.08)]"><Svg>{Icon.back}</Svg></button>
        <div className="text-center">
          <h1 className="font-display text-xl font-extrabold tracking-tight">{view.billReady ? "Your bill" : "Your table"}</h1>
          <p className="text-[11px] font-semibold text-[#8a7c6e]">Table {view.tableLabel.replace(/^T-0?/, "")}</p>
        </div>
        <span className="h-12 w-12" aria-hidden="true" />
      </header>

      <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-5">
        {view.billReady && (
          <div className="flex items-center gap-3 rounded-[20px] bg-ink px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ember font-bold">₹</span>
            <div><p className="text-sm font-bold">Your bill is ready</p><p className="text-xs text-white/60">Everything on this table has been served</p></div>
          </div>
        )}

        <section className="rounded-[26px] bg-ink p-5 text-center text-white" aria-label="Table code">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">Table code · {view.guests.length} of {view.partySize} joined</p>
          <p className="mt-2 font-display text-5xl font-extrabold tracking-[0.18em]">{view.code}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={copy} className="press h-11 flex-1 rounded-full bg-white/10 text-sm font-bold">{copied ? "Copied" : "Copy code"}</button>
            <button type="button" onClick={share} className="press h-11 flex-1 rounded-full bg-white/10 text-sm font-bold">Share</button>
          </div>
        </section>

        {perGuest.map(({ g, orders, total: gt }) => (
          <section key={g.id} className="rounded-[22px] bg-white p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ember text-sm font-bold text-white">{g.name.charAt(0).toUpperCase()}</span>
              <p className="flex-1 font-bold">{g.name}{g.id === view.me.id && <span className="font-medium text-muted"> (you)</span>}</p>
              <p className="text-sm font-bold tabular-nums">{formatINR(gt)}</p>
            </div>
            {orders.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing ordered yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {orders.map((o) => (
                  <li key={o.id} className={o.status === "cancelled" ? "opacity-50" : ""}>
                    <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-muted">
                      <span>Order #{o.number}</span>
                      <span className={o.status === "ready" ? "text-[#0a7a4d]" : o.status === "served" ? "text-muted" : "text-ember"}>{STATUS_LABEL[o.status]}</span>
                    </p>
                    {o.items.map((i, k) => (
                      <p key={k} className="flex justify-between gap-3 text-[15px] font-semibold"><span>{i.qty}× {short(i.name)}</span><span className="tabular-nums">{formatINR(i.unitPaise * i.qty)}</span></p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="rounded-[22px] bg-white p-4 text-sm">
          <div className="flex justify-between text-muted"><span>Items</span><span className="tabular-nums">{formatINR(subtotal)}</span></div>
          <div className="mt-1 flex justify-between text-muted"><span>CGST {view.restaurant.gstRateBp / 200}%</span><span className="tabular-nums">{formatINR(cgst)}</span></div>
          <div className="mt-1 flex justify-between text-muted"><span>SGST {view.restaurant.gstRateBp / 200}%</span><span className="tabular-nums">{formatINR(tax - cgst)}</span></div>
          <div className="mt-2 flex items-baseline justify-between border-t border-ink/10 pt-2"><span className="font-bold">Table total</span><span className="font-display text-2xl font-extrabold tabular-nums">{formatINR(total)}</span></div>
        </section>

        {view.billReady && (
          <section aria-label="Bill" className="rounded-[22px] bg-white p-4">
            <div className="text-center">
              <p className="font-display text-xl font-extrabold">{view.restaurant.name}</p>
              {view.restaurant.address && <p className="text-xs text-muted">{view.restaurant.address}</p>}
              <p className="mt-1 text-xs text-muted">Bill B-{String(view.billNumber ?? 0).padStart(4, "0")} · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
            </div>
            <div className="mt-3 flex gap-1.5 print:hidden">
              {([["person", "By person"], ["equal", "Split equally"], ["one", "One bill"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={split === k} onClick={() => setSplit(k)} className={`press h-10 flex-1 rounded-full text-[13px] font-bold ${split === k ? "bg-ink text-white" : "bg-cream"}`}>{l}</button>
              ))}
            </div>
            <ul className="mt-3 space-y-2">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center justify-between rounded-2xl bg-cream px-4 py-3">
                  <span><span className="block font-bold">{l.name}</span><span className="text-xs text-muted">{l.detail}</span></span>
                  <span className="font-display text-xl font-extrabold tabular-nums">{formatINR(l.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="press h-12 flex-1 rounded-full bg-ember text-sm font-bold text-white">Save / print bill</button>
            </div>
            <p className="mt-2 text-center text-xs text-muted">Pay the attendant at the table. This copy is yours to keep.</p>
          </section>
        )}
      </div>

      {!view.billReady && (
        <div className="rounded-t-[30px] bg-white px-[22px] pb-[max(18px,env(safe-area-inset-bottom))] pt-4 shadow-[0_-14px_40px_rgba(80,40,10,0.1)]">
          {view.billRequested ? (
            <p className="py-3 text-center text-sm font-semibold text-[#0a7a4d]">The attendant knows you want the bill. Finish your dishes first and we will make it as soon as everything is served.</p>
          ) : (
            <button type="button" onClick={ask} disabled={busy || live.length === 0} className="press h-14 w-full rounded-full bg-ink text-[15px] font-bold text-white disabled:opacity-40">{busy ? "…" : "Ask for the bill"}</button>
          )}
        </div>
      )}
    </div>
  );
};
