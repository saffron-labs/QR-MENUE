"use client";

import { useEffect, useState } from "react";
import { formatINR } from "@/lib/money";
import { getSupabase } from "@/lib/supabase";
import type { OrderStatus } from "@/lib/types";
import { Icon, Svg } from "./ui";

type OrderInfo = { status: OrderStatus; orderNumber: number; totalPaise: number; items: { name: string; qty: number }[] };

const STEPS: { status: OrderStatus; label: string; hint: string }[] = [
  { status: "placed", label: "Order received", hint: "The kitchen has your order." },
  { status: "preparing", label: "Preparing", hint: "Your food is being cooked." },
  { status: "ready", label: "Ready", hint: "Coming to your table now." },
  { status: "served", label: "Served", hint: "Enjoy your meal!" },
];

export const StatusScreen = ({ orderId, onBack, onNewOrder }: { orderId: string; onBack: () => void; onNewOrder: () => void }) => {
  const [info, setInfo] = useState<OrderInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await getSupabase().rpc("get_order", { p_order_id: orderId });
      if (!alive) return;
      if (error || !data) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setInfo(data as OrderInfo);
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [orderId]);

  const cancelled = info?.status === "cancelled";
  const index = info ? Math.max(0, STEPS.findIndex((s) => s.status === info.status)) : 0;
  const step = STEPS[index];
  const R = 112;
  const C = 2 * Math.PI * R;
  const progress = cancelled ? 0 : (index + 1) / STEPS.length;

  return (
    <div className="screen relative mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-[linear-gradient(160deg,#F9D9C6_0%,#F4EDE4_55%,#EFE6DA_100%)]">
      <header className="flex items-center justify-between px-[18px] pt-[18px]">
        <button type="button" onClick={onBack} aria-label="Back to menu" className="press flex h-12 w-12 items-center justify-center rounded-2xl border border-white/90 bg-white/75 shadow-[0_6px_16px_rgba(80,40,10,0.08)]"><Svg>{Icon.back}</Svg></button>
        <h1 className="font-display text-xl font-extrabold tracking-tight">Order status</h1>
        <span className="h-12 w-12" aria-hidden="true" />
      </header>

      {failed && !info ? (
        <p className="m-auto px-8 text-center text-sm text-muted">We couldn’t find this order. Please ask staff for help.</p>
      ) : (
        <div className="no-scrollbar flex-1 overflow-y-auto px-6 pb-6 pt-8 text-center">
          <div className="relative mx-auto h-[250px] w-[250px]">
            <svg viewBox="0 0 250 250" className="absolute inset-0 -rotate-90" aria-hidden="true">
              <circle cx="125" cy="125" r={R} fill="none" stroke="rgba(228,87,46,0.15)" strokeWidth="10" />
              <circle cx="125" cy="125" r={R} fill="none" stroke="#E4572E" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} className="transition-[stroke-dashoffset] duration-700" />
            </svg>
            <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-white shadow-[0_20px_40px_rgba(80,40,10,0.15)]">
              <p className="text-xs font-semibold text-[#8a7c6e]">Order</p>
              <p className="font-display text-5xl font-extrabold leading-none tracking-tight">#{info?.orderNumber ?? "…"}</p>
            </div>
          </div>

          <p className="mt-6 font-display text-[26px] font-extrabold leading-tight">{cancelled ? "Order cancelled" : step.label}</p>
          <p className="mt-1 text-sm text-muted">{cancelled ? "Please speak to a member of staff." : step.hint}</p>

          {!cancelled && (
            <ol className="mx-auto mt-6 flex max-w-[320px] gap-1.5" aria-label="Progress">
              {STEPS.map((s, i) => (
                <li key={s.status} className="flex-1">
                  <span className={`block h-1.5 rounded-full ${i <= index ? "bg-ember" : "bg-ink/10"}`} />
                  <span className={`mt-1.5 block text-[10px] font-semibold ${i === index ? "text-ink" : "text-[#a99c8f]"}`}>{s.label}</span>
                </li>
              ))}
            </ol>
          )}

          {info && (
            <div className="mx-auto mt-7 max-w-[340px] rounded-[26px] bg-white/70 p-4 text-left">
              <ul className="space-y-1.5 text-sm">
                {info.items.map((i) => (
                  <li key={i.name} className="flex justify-between gap-3"><span>{i.name.replace(/\s*\(.*?\)\s*$/, "")}</span><span className="font-bold tabular-nums">×{i.qty}</span></li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between border-t border-ink/10 pt-3 text-sm"><span className="font-bold">Total (incl. GST)</span><span className="font-bold tabular-nums">{formatINR(info.totalPaise)}</span></p>
            </div>
          )}

          <button type="button" onClick={onNewOrder} className="press mx-auto mt-6 h-12 rounded-full bg-ink px-6 text-sm font-bold text-white">Order something more</button>
        </div>
      )}
    </div>
  );
};
