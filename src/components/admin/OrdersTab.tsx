"use client";

import { useCallback, useState } from "react";
import { fetchAdminOrders } from "@/lib/admin";
import { formatINR } from "@/lib/money";
import { StatusChip } from "./OverviewCards";
import { useLoad } from "./useLoad";

const STATUSES = ["all", "placed", "preparing", "ready", "served", "cancelled"] as const;
type Props = { slug: string; pin: string; days: number; onAuthError: () => void };

export const OrdersTab = ({ slug, pin, days, onAuthError }: Props) => {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => fetchAdminOrders(slug, pin, days, status === "all" ? null : status), [slug, pin, days, status]);
  const { data, error } = useLoad(load, onAuthError);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={`press rounded-full border-[1.5px] px-4 py-2 text-[13px] font-bold capitalize ${status === s ? "border-ink bg-ink text-white" : "border-[#e2e2dc] bg-white"}`}>{s}</button>
        ))}
      </div>
      {error && <p className="text-sm font-semibold text-ember">{error}</p>}
      {data && data.orders.length === 0 && <p className="text-sm text-muted">No orders match.</p>}
      <ul className="space-y-2">
        {data?.orders.map((o) => (
          <li key={o.id} className="rounded-[22px] bg-surface">
            <button type="button" onClick={() => setOpen(open === o.id ? null : o.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
              <span>
                <span className="font-bold">#{o.number} · {o.table}</span>
                <span className="ml-2 align-middle"><StatusChip status={o.status} /></span>
                <span className="mt-0.5 block text-xs text-muted">{new Date(o.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{o.customer ? ` · ${o.customer}` : ""}</span>
              </span>
              <span className="font-bold tabular-nums">{formatINR(o.totalPaise)}</span>
            </button>
            {open === o.id && (
              <div className="space-y-1 border-t border-ink/10 bg-white/60 px-4 py-3 text-sm">
                {o.items.map((i, k) => (
                  <p key={k} className="flex justify-between gap-3"><span>{i.qty}× {i.name}{i.modifiers?.length ? ` (${i.modifiers.map((m) => m.option).join(", ")})` : ""}</span><span className="tabular-nums text-muted">{formatINR(i.unitPaise * i.qty)}</span></p>
                ))}
                {o.notes && <p className="text-muted">Note: {o.notes}</p>}
                <p className="pt-1 text-xs text-muted">Subtotal {formatINR(o.subtotalPaise)} · GST {formatINR(o.taxPaise)}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
