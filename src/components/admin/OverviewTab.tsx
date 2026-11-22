"use client";

import { useCallback } from "react";
import { fetchOverview } from "@/lib/admin";
import { formatINR } from "@/lib/money";
import { useLoad } from "./useLoad";

const Kpi = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-white p-4 shadow-[0_6px_16px_rgba(80,40,10,0.06)]">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
    <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">{value}</p>
  </div>
);

const Bars = ({ rows }: { rows: { label: string; value: number; sub?: string }[] }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex h-36 items-end gap-1">
      {rows.map((r) => (
        <div key={r.label} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1" title={r.sub}>
          <div className="flex w-full flex-1 items-end">
            <div className="w-full rounded-t bg-ember/80" style={{ height: `${Math.max(2, (r.value / max) * 100)}%`, opacity: r.value ? 1 : 0.2 }} />
          </div>
          <span className="text-[10px] text-muted">{r.label}</span>
        </div>
      ))}
    </div>
  );
};

type Props = { slug: string; pin: string; days: number; onAuthError: () => void };

export const OverviewTab = ({ slug, pin, days, onAuthError }: Props) => {
  const load = useCallback(() => fetchOverview(slug, pin, days), [slug, pin, days]);
  const { data, error } = useLoad(load, onAuthError);
  if (error) return <p className="text-sm font-semibold text-ember">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const t = data.totals;
  const hours = data.byHour.filter((h) => h.hour >= 10 || h.orders > 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Revenue" value={formatINR(t.revenuePaise)} />
        <Kpi label="Orders" value={String(t.orders)} />
        <Kpi label="Avg order" value={formatINR(t.avgPaise)} />
        <Kpi label="GST collected" value={formatINR(t.taxPaise)} />
        <Kpi label="Open now" value={String(t.open)} />
        <Kpi label="Cancelled" value={String(t.cancelled)} />
      </div>
      {days > 1 && (
        <section className="rounded-2xl bg-white p-4">
          <h2 className="mb-3 text-sm font-bold">Revenue by day</h2>
          <Bars rows={data.byDay.map((d) => ({ label: d.day.slice(8), value: d.revenuePaise, sub: `${d.day}: ${formatINR(d.revenuePaise)}` }))} />
        </section>
      )}
      <section className="rounded-2xl bg-white p-4">
        <h2 className="mb-3 text-sm font-bold">Orders by hour</h2>
        <Bars rows={hours.map((h) => ({ label: String(h.hour), value: h.orders, sub: `${h.hour}:00 — ${h.orders} orders` }))} />
      </section>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl bg-white p-4">
          <h2 className="mb-2 text-sm font-bold">Top dishes</h2>
          {data.top.length === 0 ? <p className="text-sm text-muted">No orders in this period.</p> : (
            <ol className="space-y-1.5 text-sm">
              {data.top.map((d) => (
                <li key={d.name} className="flex justify-between gap-3"><span className="truncate">{d.name}</span><span className="tabular-nums text-muted">{d.qty} · {formatINR(d.revenuePaise)}</span></li>
              ))}
            </ol>
          )}
        </section>
        <section className="rounded-2xl bg-white p-4">
          <h2 className="mb-2 text-sm font-bold">By table</h2>
          {data.byTable.length === 0 ? <p className="text-sm text-muted">No orders in this period.</p> : (
            <ul className="space-y-1.5 text-sm">
              {data.byTable.map((d) => (
                <li key={d.table} className="flex justify-between gap-3"><span>{d.table}</span><span className="tabular-nums text-muted">{d.orders} · {formatINR(d.revenuePaise)}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
