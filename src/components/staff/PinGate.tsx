"use client";

import { useState } from "react";

type Props = { title: string; subtitle: string; error: string | null; onSubmit: (pin: string) => Promise<boolean> };

export const PinGate = ({ title, subtitle, error, onSubmit }: Props) => {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (value: string) => {
    setBusy(true);
    const ok = await onSubmit(value);
    if (!ok) setPin("");
    setBusy(false);
  };
  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 8);
    setPin(next);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <p className="font-display text-3xl font-extrabold tracking-tight">{title}</p>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      <div aria-live="polite" className="flex h-8 items-center gap-2" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => (
          <span key={i} className={`h-3 w-3 rounded-full ${i < pin.length ? "bg-ink" : "bg-ink/15"}`} />
        ))}
      </div>
      <p role="alert" className="min-h-5 text-center text-sm font-semibold text-ember">{error ?? ""}</p>
      <div className="grid w-full grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="press h-16 rounded-2xl bg-white text-2xl font-bold shadow-[0_6px_16px_rgba(80,40,10,0.08)]">{d}</button>
        ))}
        <button type="button" onClick={() => setPin(pin.slice(0, -1))} aria-label="Delete last digit" className="press h-16 rounded-2xl text-xl text-muted">⌫</button>
        <button type="button" onClick={() => press("0")} className="press h-16 rounded-2xl bg-white text-2xl font-bold shadow-[0_6px_16px_rgba(80,40,10,0.08)]">0</button>
        <button type="button" disabled={pin.length < 4 || busy} onClick={() => submit(pin)} className="press h-16 rounded-2xl bg-ink text-base font-bold text-white disabled:opacity-40">{busy ? "…" : "Enter"}</button>
      </div>
    </main>
  );
};
