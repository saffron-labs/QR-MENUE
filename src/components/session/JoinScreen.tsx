"use client";

import { useState } from "react";

type Props = { restaurantName: string; tableLabel: string; onJoin: (code: string, name: string) => Promise<string | null> };

export const JoinScreen = ({ restaurantName, tableLabel, onJoin }: Props) => {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    const message = await onJoin(code, name.trim());
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
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight">This table is already ordering.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">Ask your friend for the 4-character table code. It is on their screen.</p>
        <label className="mt-7 block text-[13px] font-bold text-muted">Table code
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} autoCapitalize="characters" autoComplete="off" inputMode="text"
            className="mt-2 h-[72px] w-full rounded-[18px] border-2 border-ink bg-white text-center font-display text-4xl font-extrabold uppercase tracking-[0.4em] text-ink outline-none focus:border-ember" />
        </label>
        <label className="mt-5 block text-[13px] font-bold text-muted">Your name
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} autoComplete="given-name" className="mt-2 h-[52px] w-full rounded-2xl border-[1.5px] border-ink/15 bg-white px-4 text-base font-medium text-ink outline-none focus:border-ember" />
        </label>
        {error && <p role="alert" className="mt-4 rounded-2xl bg-[#fdecea] px-3.5 py-2.5 text-sm font-semibold text-[#b3261e]">{error}</p>}
        <p className="mt-5 text-center text-sm text-muted">Not with them? Please ask the attendant for help.</p>
      </div>
      <button type="button" onClick={go} disabled={busy || code.length < 4} className="press h-14 w-full rounded-full bg-ember text-[17px] font-bold text-white shadow-[0_12px_24px_rgba(228,87,46,0.35)] disabled:opacity-50">
        {busy ? "Joining…" : "Join table"}
      </button>
    </main>
  );
};
