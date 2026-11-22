"use client";

import { useState } from "react";

type Props = { restaurantName: string; tableLabel: string; onCreate: (party: number, name: string) => Promise<string | null> };

export const PartyScreen = ({ restaurantName, tableLabel, onCreate }: Props) => {
  const [n, setN] = useState(2);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    const message = await onCreate(n, name.trim());
    if (message) setError(message);
    setBusy(false);
  };

  return (
    <main className="screen mx-auto flex min-h-dvh max-w-[480px] flex-col bg-cream px-6 pb-8 pt-7">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-muted">{restaurantName}</span>
        <span className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold">Table {tableLabel.replace(/^T-0?/, "")}</span>
      </div>
      <div className="flex-1 pt-12">
        <p className="text-[15px] font-semibold text-[#a8351a]">Welcome</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold leading-[1.05] tracking-tight">How many of you are eating?</h1>
        <div className="mt-9 flex items-center justify-between rounded-[28px] bg-white p-6">
          <button type="button" aria-label="Fewer people" onClick={() => setN(Math.max(1, n - 1))} className="press h-14 w-14 rounded-full bg-cream text-3xl font-bold">−</button>
          <div className="text-center">
            <p className="font-display text-6xl font-extrabold leading-none tabular-nums">{n}</p>
            <p className="mt-1 text-sm text-muted">{n === 1 ? "person" : "people"}</p>
          </div>
          <button type="button" aria-label="More people" onClick={() => setN(Math.min(12, n + 1))} className="press h-14 w-14 rounded-full bg-ink text-3xl font-bold text-white">+</button>
        </div>
        <label className="mt-6 block text-[13px] font-bold text-muted">Your name
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} autoComplete="given-name" className="mt-2 h-[52px] w-full rounded-2xl border-[1.5px] border-ink/15 bg-white px-4 text-base font-medium text-ink outline-none focus:border-ember" />
        </label>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          {n === 1 ? "Just you? Order straight away. Friends can still join later with the table code." : "Everyone orders from their own phone onto one table. You will get a code to share."}
        </p>
        {error && <p role="alert" className="mt-3 rounded-2xl bg-[#fdecea] px-3.5 py-2.5 text-sm font-semibold text-[#b3261e]">{error}</p>}
      </div>
      <button type="button" onClick={go} disabled={busy} className="press h-14 w-full rounded-full bg-ember text-[17px] font-bold text-white shadow-[0_12px_24px_rgba(228,87,46,0.35)] disabled:opacity-60">
        {busy ? "Opening your table…" : n === 1 ? "See the menu" : "Create table code"}
      </button>
    </main>
  );
};
