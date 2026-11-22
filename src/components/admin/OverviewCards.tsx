import type { ReactNode } from "react";
import type { FloorTable } from "@/lib/admin";
import { formatINR } from "@/lib/money";

export const Card = ({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`rounded-[28px] bg-surface p-5 md:p-6 ${className}`}>
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-bold">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

export const Pill = ({ children, dark = false }: { children: ReactNode; dark?: boolean }) => (
  <span className={`rounded-xl px-2.5 py-1 text-xs font-bold ${dark ? "bg-ink text-white" : "bg-lime text-ink"}`}>{children}</span>
);

export type KpiData = { label: string; value: string; delta: string | null; good: boolean; sub: string; spark: number[] };

export const Kpi = ({ k, lead }: { k: KpiData; lead: boolean }) => {
  const max = Math.max(1, ...k.spark);
  return (
    <div className={`rounded-[26px] p-4 ${lead ? "bg-lime" : "bg-surface"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{k.label}</span>
        {k.delta && <span className={`rounded-[10px] px-2 py-0.5 text-[11px] font-bold ${lead ? "bg-ink/10" : "bg-white"} ${k.good ? "text-emerald-700" : "text-ember"}`}>{k.delta}</span>}
      </div>
      <p className="mt-2.5 font-display text-3xl font-extrabold leading-none tracking-tight tabular-nums">{k.value}</p>
      <p className="mt-1 text-xs text-muted">{k.sub}</p>
      <div className="mt-3 flex h-7 items-end gap-1" aria-hidden="true">
        {k.spark.map((v, i) => (
          <span key={i} className={`flex-1 rounded ${i === k.spark.length - 1 ? "bg-ink" : lead ? "bg-ink/25" : "bg-[#d9d9d2]"}`} style={{ height: `${Math.max(12, (v / max) * 100)}%` }} />
        ))}
      </div>
    </div>
  );
};

export type ChartPoint = { label: string; cur: number; prev: number };

export const RevenueChart = ({ points }: { points: ChartPoint[] }) => {
  const max = Math.max(1, ...points.flatMap((p) => [p.cur, p.prev]));
  const peak = points.reduce((best, p, i) => (p.cur > (points[best]?.cur ?? 0) ? i : best), 0);
  const H = 170;
  return (
    <div>
      <div className="mt-5 flex h-[230px] items-end gap-1.5 md:gap-2.5">
        {points.map((p, i) => {
          const h = Math.max(p.cur ? 6 : 2, Math.round((p.cur / max) * H));
          const hp = Math.max(p.prev ? 6 : 2, Math.round((p.prev / max) * H));
          return (
            <div key={i} className="relative flex h-full min-w-0 flex-1 items-end justify-center gap-[3px]">
              <span className="w-[38%] max-w-[26px] rounded-t-[9px] rounded-b-[3px] bg-[#d9d9d2]" style={{ height: hp }} />
              <span className="w-[38%] max-w-[26px] rounded-t-[9px] rounded-b-[3px] bg-ink" style={{ height: h }} />
              {i === peak && p.cur > 0 && (
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-ink px-2.5 py-1 text-xs font-extrabold text-lime" style={{ bottom: h + 8 }}>{formatINR(p.cur)}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5 md:gap-2.5">
        {points.map((p, i) => <span key={i} className={`min-w-0 flex-1 truncate text-center text-[10px] font-semibold text-muted md:text-[11px] ${points.length > 12 && i % 3 ? "max-md:invisible" : ""}`}>{p.label}</span>)}
      </div>
    </div>
  );
};

const FLOOR_STYLE: Record<FloorTable["state"], string> = {
  free: "border-[#d9d9d2] bg-white text-ink",
  eating: "border-ink bg-ink text-white",
  bill: "border-lime bg-lime text-ink",
  late: "border-ember bg-ember text-white",
};

export const floorLine = (f: FloorTable): string => {
  if (f.state === "free") return "Free";
  if (f.state === "bill") return `Bill ${formatINR(f.totalPaise)}`;
  const who = f.party ? `${f.joined}/${f.party}` : String(f.joined);
  return `${f.code ?? ""} · ${who}`;
};

export const FloorTile = ({ f }: { f: FloorTable }) => (
  <div className={`rounded-2xl border-[1.5px] px-2.5 py-2.5 ${FLOOR_STYLE[f.state]}`}>
    <p className="text-xs font-extrabold">{f.label}</p>
    <p className="mt-0.5 truncate text-[11px] font-semibold opacity-80">{floorLine(f)}</p>
  </div>
);

export const FloorLegend = () => (
  <div className="mt-3.5 flex flex-wrap gap-3 text-[11px] font-semibold text-muted">
    {([["Free", "border-[1.5px] border-[#d9d9d2] bg-white"], ["Eating", "bg-ink"], ["Bill ready", "bg-lime"], ["Waiting long", "bg-ember"]] as const).map(([l, c]) => (
      <span key={l} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-[3px] ${c}`} />{l}</span>
    ))}
  </div>
);

export const STATUS_LABEL: Record<string, string> = { placed: "New", preparing: "Cooking", ready: "Ready", served: "Served", cancelled: "Cancelled" };
const STATUS_STYLE: Record<string, string> = {
  placed: "bg-[#fff3c4] text-[#7a5b00]", preparing: "bg-[#ffe1d5] text-[#a8351a]", ready: "bg-[#dff5e6] text-emerald-800",
  served: "bg-[#ececea] text-[#55554f]", cancelled: "bg-[#ececea] text-[#8a8a84] line-through",
};
export const StatusChip = ({ status }: { status: string }) => (
  <span className={`inline-block rounded-[13px] px-3 py-1 text-center text-xs font-bold ${STATUS_STYLE[status] ?? STATUS_STYLE.served}`}>{STATUS_LABEL[status] ?? status}</span>
);

export const istTime = (iso: string): string => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
