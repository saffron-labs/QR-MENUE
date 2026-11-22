"use client";

import { useState } from "react";
import { PinGate } from "@/components/staff/PinGate";
import { fetchOverview } from "@/lib/admin";
import { MenuTab } from "./MenuTab";
import { OrdersTab } from "./OrdersTab";
import { OverviewTab } from "./OverviewTab";
import { SettingsTab } from "./SettingsTab";
import { TablesTab } from "./TablesTab";
import { useAdminPin } from "./useAdminPin";

const TABS = ["Overview", "Orders", "Menu", "Tables & QR", "Settings"] as const;
const RANGES = [[1, "Today"], [7, "7 days"], [30, "30 days"]] as const;

export const AdminDashboard = ({ slug, restaurantName }: { slug: string; restaurantName: string }) => {
  const { pin, ready, setPin } = useAdminPin(slug);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [days, setDays] = useState<number>(1);

  if (!ready) return null;
  if (!pin) {
    return (
      <PinGate
        title={`${restaurantName} admin`}
        subtitle="Enter the admin PIN"
        error={error}
        onSubmit={async (value) => {
          try { await fetchOverview(slug, value, 1); setError(null); setPin(value); return true; }
          catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); return false; }
        }}
      />
    );
  }
  const lock = () => setPin(null);
  const authError = () => { setError("Please enter the PIN again."); setPin(null); };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-5">
      <header className="flex items-center justify-between gap-3 print:hidden">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">{restaurantName} <span className="text-muted">admin</span></h1>
        <button type="button" onClick={lock} className="press rounded-full bg-white px-4 py-2 text-sm font-semibold">Lock</button>
      </header>
      <nav className="mt-4 flex gap-2 overflow-x-auto print:hidden" aria-label="Admin sections">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-current={tab === t} className={`press shrink-0 rounded-full px-4 py-2 text-sm font-bold ${tab === t ? "bg-ink text-cream" : "bg-white"}`}>{t}</button>
        ))}
      </nav>
      {(tab === "Overview" || tab === "Orders") && (
        <div className="mt-3 flex gap-2 print:hidden">
          {RANGES.map(([d, l]) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={`press rounded-full px-3 py-1.5 text-xs font-bold ${days === d ? "bg-ember text-white" : "bg-peach"}`}>{l}</button>
          ))}
        </div>
      )}
      <div className="mt-4">
        {tab === "Overview" && <OverviewTab slug={slug} pin={pin} days={days} onAuthError={authError} />}
        {tab === "Orders" && <OrdersTab slug={slug} pin={pin} days={days} onAuthError={authError} />}
        {tab === "Menu" && <MenuTab slug={slug} pin={pin} onAuthError={authError} />}
        {tab === "Tables & QR" && <TablesTab slug={slug} pin={pin} onAuthError={authError} />}
        {tab === "Settings" && <SettingsTab slug={slug} pin={pin} onPinChanged={setPin} />}
      </div>
    </main>
  );
};
