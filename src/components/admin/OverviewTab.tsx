"use client";

import { useCallback } from "react";
import { fetchInsights, fetchOverview, fetchStockAlerts, type Insights, type Overview, type StockAlert } from "@/lib/admin";
import { formatINR } from "@/lib/money";
import { Card, FloorLegend, FloorTile, Kpi, Pill, RevenueChart, StatusChip, istTime, type ChartPoint, type KpiData } from "./OverviewCards";
import { useLoad } from "./useLoad";

type Props = { slug: string; pin: string; days: number; onGoOrders: () => void; onAuthError: () => void };
type Bundle = { o: Overview; i: Insights; stock: StockAlert[] };

const CAT_COLORS = ["#17120e", "#e4572e", "#e6f542", "#b9b9b1", "#f7d2be", "#8a8a84"];

const pctDelta = (cur: number, prev: number): { text: string | null; good: boolean } => {
  if (!prev) return { text: null, good: true };
  const p = Math.round(((cur - prev) / prev) * 100);
  return { text: `${p >= 0 ? "+" : ""}${p}%`, good: p >= 0 };
};
const diffDelta = (cur: number, prev: number, fmt: (n: number) => string = String): { text: string | null; good: boolean } => {
  const d = cur - prev;
  if (d === 0) return { text: null, good: true };
  return { text: `${d >= 0 ? "+" : "-"}${fmt(Math.abs(d))}`, good: d >= 0 };
};

/** First hour worth showing: 10am by default, earlier when there is data before it. */
const firstHour = (series: number[][]): number => {
  const early = series.flatMap((a) => a.map((v, h) => (v > 0 && h < 10 ? h : 10)));
  return Math.min(10, ...early);
};

const buildKpis = ({ o, i }: Bundle, days: number): KpiData[] => {
  const t = o.totals;
  const start = firstHour([i.revByHour, i.prevRevByHour]);
  const revSeries = days > 1 ? o.byDay.map((d) => d.revenuePaise) : i.revByHour.slice(start);
  const ordSeries = days > 1 ? o.byDay.map((d) => d.orders) : o.byHour.slice(start).map((h) => h.orders);
  const tail = (a: number[]) => a.slice(-8);
  const rev = pctDelta(t.revenuePaise, i.prev.revenuePaise);
  const ord = diffDelta(t.orders, i.prev.orders);
  const avg = diffDelta(t.avgPaise, i.prev.avgPaise, formatINR);
  const gst = pctDelta(t.taxPaise, i.prev.taxPaise);
  const gue = diffDelta(i.guests, i.prevGuests);
  const tbl = i.avgTableMin != null && i.prevAvgTableMin != null ? diffDelta(i.avgTableMin, i.prevAvgTableMin, (n) => `${n} min`) : { text: null, good: true };
  const per = t.orders ? (i.guests / t.orders).toFixed(1) : "0";
  return [
    { label: "Revenue", value: formatINR(t.revenuePaise), delta: rev.text, good: rev.good, sub: `${t.orders} orders · ${i.guests} guests`, spark: tail(revSeries) },
    { label: "Orders", value: String(t.orders), delta: ord.text, good: ord.good, sub: `${t.open} open now`, spark: tail(ordSeries) },
    { label: "Avg order", value: formatINR(t.avgPaise), delta: avg.text, good: avg.good, sub: "per order", spark: tail(revSeries) },
    { label: "Guests", value: String(i.guests), delta: gue.text, good: gue.good, sub: `${per} per order`, spark: tail(ordSeries) },
    { label: "Table time", value: i.avgTableMin != null ? `${i.avgTableMin} min` : "—", delta: tbl.text, good: !tbl.good, sub: "seat to paid", spark: tail(ordSeries) },
    { label: "GST", value: formatINR(t.taxPaise), delta: gst.text, good: gst.good, sub: "CGST + SGST", spark: tail(revSeries) },
  ];
};

const buildChart = ({ o, i }: Bundle, days: number): ChartPoint[] => {
  if (days === 1) {
    const start = firstHour([i.revByHour, i.prevRevByHour]);
    return Array.from({ length: 24 - start }, (_, k) => {
      const h = start + k;
      return { label: String(h % 12 === 0 ? 12 : h % 12), cur: i.revByHour[h] ?? 0, prev: i.prevRevByHour[h] ?? 0 };
    });
  }
  return o.byDay.map((d, k) => ({ label: days <= 7 ? new Date(`${d.day}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" }) : d.day.slice(8), cur: d.revenuePaise, prev: i.prevByDay[k] ?? 0 }));
};

const Alerts = ({ i, stock }: { i: Insights; stock: StockAlert[] }) => {
  const rows: { tone: string; title: string; sub: string; when: string }[] = [
    ...i.late.map((l) => ({ tone: "bg-ember", title: `${l.table} waiting ${l.minutes} min`, sub: `Order #${l.number} · ${l.status === "placed" ? "not started" : "cooking"}`, when: `${l.minutes}m` })),
    ...i.floor.filter((f) => f.state === "bill").map((f) => ({ tone: "bg-ink", title: `${f.label} bill ready`, sub: `${formatINR(f.totalPaise)} · waiting to close`, when: `${f.quietMin ?? 0}m` })),
    ...stock.slice(0, 3).map((s) => ({ tone: s.status === "out" ? "bg-ember" : "bg-amber-400", title: s.status === "out" ? `${s.name} is out of stock` : `${s.name} running low`, sub: s.status === "out" ? "Dishes using it switch off" : `${s.qty} ${s.unit} left · reorder at ${s.reorderLevel}`, when: "" })),
    ...i.unavailable.map((n) => ({ tone: "bg-amber-400", title: `${n} unavailable`, sub: "Switched off on the menu", when: "" })),
  ];
  if (rows.length === 0) return <p className="mt-4 rounded-2xl bg-white p-4 text-sm font-semibold text-muted">All clear. Nothing needs you right now.</p>;
  return (
    <ul className="mt-3.5 space-y-2.5">
      {rows.slice(0, 6).map((r, k) => (
        <li key={k} className="flex items-center gap-3 rounded-[18px] bg-white px-3.5 py-3">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.tone}`} />
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{r.title}</span><span className="block text-xs text-muted">{r.sub}</span></span>
          <span className="text-xs font-bold text-[#55554f]">{r.when}</span>
        </li>
      ))}
    </ul>
  );
};

const Pipeline = ({ i }: { i: Insights }) => {
  const rows = [["Received", i.pipeline.placed, "bg-lime"], ["Cooking", i.pipeline.preparing, "bg-ember"], ["Ready to serve", i.pipeline.ready, "bg-ink"], ["Served, not billed", i.pipeline.servedOpen, "bg-[#b9b9b1]"]] as const;
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <>
      <p className="mt-0.5 text-[13px] text-muted">Right now, across all tables</p>
      <div className="mt-4 space-y-3">
        {rows.map(([l, n, c]) => (
          <div key={l}>
            <div className="flex justify-between text-[13px] font-semibold"><span>{l}</span><span className="text-muted">{n}</span></div>
            <div className="mt-1.5 h-2.5 rounded-full bg-white"><div className={`h-2.5 rounded-full ${c}`} style={{ width: `${Math.round((n / max) * 100)}%`, minWidth: n ? 10 : 0 }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-white px-3 py-2.5"><p className="text-[11px] font-bold uppercase tracking-wider text-muted">Table time</p><p className="mt-0.5 font-display text-xl font-extrabold">{i.avgTableMin != null ? `${i.avgTableMin} min` : "—"}</p></div>
        <div className="rounded-2xl bg-white px-3 py-2.5"><p className="text-[11px] font-bold uppercase tracking-wider text-muted">Late orders</p><p className={`mt-0.5 font-display text-xl font-extrabold ${i.late.length ? "text-ember" : ""}`}>{i.late.length}</p></div>
      </div>
    </>
  );
};

const Categories = ({ i }: { i: Insights }) => {
  const total = i.byCategory.reduce((s, c) => s + c.revenuePaise, 0);
  const shares = i.byCategory.map((c) => (total ? (c.revenuePaise / total) * 100 : 0));
  const stops = shares.map((share, k) => {
    const from = shares.slice(0, k).reduce((a, b) => a + b, 0);
    return `${CAT_COLORS[k % CAT_COLORS.length]} ${from}% ${from + share}%`;
  });
  if (!total) return <p className="mt-4 text-sm text-muted">No sales in this period.</p>;
  return (
    <div className="mt-4 flex items-center gap-5">
      <div className="relative h-[132px] w-[132px] shrink-0 rounded-full" style={{ background: `conic-gradient(${stops.join(",")})` }} role="img" aria-label="Sales by category">
        <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-surface"><span className="font-display text-lg font-extrabold">{formatINR(total)}</span><span className="text-[10px] font-bold uppercase tracking-wider text-muted">total</span></div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {i.byCategory.slice(0, 6).map((c, k) => (
          <li key={c.name} className="flex items-center gap-2 text-[13px] font-semibold">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: CAT_COLORS[k % CAT_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate">{c.name}</span><span className="text-muted">{Math.round((c.revenuePaise / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const HourBars = ({ o }: { o: Overview }) => {
  const start = firstHour([o.byHour.map((h) => h.orders)]);
  const hours = o.byHour.filter((h) => h.hour >= start);
  const max = Math.max(1, ...hours.map((h) => h.orders));
  return (
    <div className="mt-5 flex h-[170px] items-end gap-1.5">
      {hours.map((h) => (
        <div key={h.hour} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${h.hour}:00 — ${h.orders} orders`}>
          <span className={`w-full rounded-t-lg rounded-b-[3px] ${h.orders === max && h.orders ? "bg-ink" : h.orders > max * 0.55 ? "bg-[#9a9a90]" : "bg-[#d9d9d2]"}`} style={{ height: Math.max(3, (h.orders / max) * 130) }} />
          <span className={`text-[10px] font-semibold text-muted md:text-[11px] ${hours.length > 12 && h.hour % 3 ? "max-md:invisible" : ""}`}>{h.hour % 12 === 0 ? 12 : h.hour % 12}</span>
        </div>
      ))}
    </div>
  );
};

export const OverviewTab = ({ slug, pin, days, onGoOrders, onAuthError }: Props) => {
  const load = useCallback(async (): Promise<Bundle> => {
    const [o, i, stock] = await Promise.all([fetchOverview(slug, pin, days), fetchInsights(slug, pin, days), fetchStockAlerts(slug, pin)]);
    return { o, i, stock };
  }, [slug, pin, days]);
  const { data, error } = useLoad(load, onAuthError);
  if (error) return <p className="text-sm font-semibold text-ember">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { o, i, stock } = data;
  const busy = i.floor.filter((f) => f.state !== "free").length;
  const peakHour = o.byHour.reduce((b, h) => (h.orders > b.orders ? h : b), { hour: 0, orders: 0 });
  const total = formatINR(o.totals.revenuePaise);
  const topMax = Math.max(1, ...o.top.map((d) => d.qty));
  const tlStart = firstHour([i.timeline.map((t) => t.orders)]);
  const tl = i.timeline.filter((t) => t.hour >= tlStart);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {buildKpis(data, days).map((k, n) => <Kpi key={k.label} k={k} lead={n === 0} />)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card title="Revenue" aside={<span className="flex gap-3.5 text-xs font-semibold text-muted"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink" />This period</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#d9d9d2]" />Previous</span></span>}>
          <p className="mt-0.5 text-[13px] text-muted">{days === 1 ? "Today, by hour" : `Last ${days} days`} · total {total}</p>
          <RevenueChart points={buildChart(data, days)} />
        </Card>
        <Card title="Live floor" aside={<Pill>{busy} of {i.floor.length} busy</Pill>}>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">{i.floor.map((f) => <FloorTile key={f.label} f={f} />)}</div>
          <FloorLegend />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Needs attention"><Alerts i={i} stock={stock} /></Card>
        <Card title="Order pipeline"><Pipeline i={i} /></Card>
        <Card title="Sales by category"><Categories i={i} /></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Orders by hour" aside={peakHour.orders ? <Pill dark>Peak {peakHour.hour % 12 === 0 ? 12 : peakHour.hour % 12} {peakHour.hour >= 12 ? "pm" : "am"}</Pill> : null}><HourBars o={o} /></Card>
        <Card title="Top dishes" aside={<span className="text-xs font-semibold text-muted">units · revenue</span>}>
          {o.top.length === 0 ? <p className="mt-4 text-sm text-muted">No orders in this period.</p> : (
            <ol className="mt-3.5 space-y-2.5">
              {o.top.slice(0, 5).map((d, k) => (
                <li key={d.name} className="flex items-center gap-3 rounded-[18px] bg-white py-2.5 pl-2.5 pr-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-peach font-display text-base font-extrabold text-[#a8351a]">{k + 1}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{d.name}</span><span className="mt-1.5 block h-[5px] rounded-full bg-[#f0f0ec]"><span className="block h-[5px] rounded-full bg-ember" style={{ width: `${Math.round((d.qty / topMax) * 100)}%` }} /></span></span>
                  <span className="text-right"><span className="block text-sm font-bold">{d.qty} sold</span><span className="block text-xs text-muted">{formatINR(d.revenuePaise)}</span></span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card title="Recent orders" aside={<button type="button" onClick={onGoOrders} className="press rounded-full bg-ink px-4 py-1.5 text-xs font-bold text-white">See all orders</button>}>
        {i.recent.length === 0 ? <p className="mt-4 text-sm text-muted">No orders yet.</p> : (
          <ul className="mt-3.5 space-y-2">
            {i.recent.slice(0, 6).map((r) => (
              <li key={r.number} className="grid grid-cols-[3rem_4.5rem_3.5rem_1fr_auto] items-center gap-3 rounded-2xl bg-white px-3.5 py-3 text-[13px] font-semibold md:grid-cols-[3.5rem_5rem_4rem_1fr_2fr_5rem_6.5rem]">
                <span className="font-extrabold">#{r.number}</span>
                <span className="text-muted">{istTime(r.createdAt)}</span>
                <span>{r.table}</span>
                <span className="truncate md:block">{r.customer ?? "Guest"}</span>
                <span className="hidden truncate font-medium text-[#55554f] md:block">{r.items}</span>
                <span className="hidden font-extrabold tabular-nums md:block">{formatINR(r.totalPaise)}</span>
                <StatusChip status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section className="rounded-[34px] bg-ink px-5 py-4 text-white md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold">Service timeline</h2>
          <span className="flex gap-3.5 text-[11px] font-semibold text-[#b9b9b1]">
            {([["Orders", "bg-lime"], ["Tables closed", "bg-white"], ["Slow", "bg-ember"]] as const).map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} />{l}</span>)}
          </span>
        </div>
        <div className="mt-3.5 flex gap-1.5">
          {tl.map((t) => (
            <div key={t.hour} className="min-w-0 flex-1 text-center">
              <div className="flex h-12 flex-col items-center justify-end gap-1">
                {t.orders > 0 && <span className="flex items-center justify-center rounded-full bg-lime text-[10px] font-extrabold text-ink" style={{ width: 14 + Math.min(t.orders, 9) * 3, height: 14 + Math.min(t.orders, 9) * 3 }}>{t.orders}</span>}
                {t.bills > 0 && <span className="h-2 w-2 rounded-full bg-white" />}
                {t.late > 0 && <span className="h-2 w-2 rounded-full bg-ember" />}
              </div>
              <p className={`mt-1.5 text-[10px] font-semibold text-[#b9b9b1] md:text-[11px] ${tl.length > 12 && t.hour % 3 ? "max-md:invisible" : ""}`}>{t.hour % 12 === 0 ? 12 : t.hour % 12}{t.hour >= 12 ? "p" : "a"}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
