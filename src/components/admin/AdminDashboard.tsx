"use client";

import { useState } from "react";
import { PinGate } from "@/components/staff/PinGate";
import { fetchOverview } from "@/lib/admin";
import { InventoryTab } from "./InventoryTab";
import { MenuTab } from "./MenuTab";
import { OrdersTab } from "./OrdersTab";
import { OverviewTab } from "./OverviewTab";
import { SettingsTab } from "./SettingsTab";
import { TablesTab } from "./TablesTab";
import { useAdminPin } from "./useAdminPin";

const TABS = ["Overview", "Orders", "Menu", "Inventory", "Tables & QR", "Settings"] as const;
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

  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
  const titles: Record<(typeof TABS)[number], string> = { Overview: "How we are doing", Orders: "Orders", Menu: "Menu", Inventory: "Inventory", "Tables & QR": "Tables & QR", Settings: "Settings" };

  return (
    <div className="min-h-dvh bg-white">
      <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-5 md:px-9">
        <header className="flex flex-wrap items-center justify-between gap-3.5 print:hidden">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-ink font-display text-xl font-extrabold text-lime">{restaurantName.charAt(0)}</span>
            <h1 className="font-display text-xl font-extrabold tracking-tight md:text-2xl">{restaurantName} <span className="font-semibold text-[#9a9a94]">· admin</span></h1>
          </div>
          <nav className="order-last flex w-full gap-1.5 overflow-x-auto rounded-full bg-[#f3f3ef] p-1.5 no-scrollbar lg:order-none lg:w-auto" aria-label="Admin sections">
            {TABS.map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} aria-current={tab === t} className={`press shrink-0 rounded-full px-[18px] py-2.5 text-[13px] font-bold ${tab === t ? "bg-ink text-white" : "text-[#55554f]"}`}>{t}</button>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-2 rounded-full bg-[#f3f3ef] px-4 py-2.5 text-[13px] font-semibold text-[#55554f] sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" />Open · {today}</span>
            <button type="button" onClick={lock} className="press rounded-full border-[1.5px] border-[#e2e2dc] bg-white px-5 py-2.5 text-[13px] font-bold">Lock</button>
          </div>
        </header>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-3.5 print:hidden">
          <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight md:text-[38px]">{titles[tab]}</h2>
          {(tab === "Overview" || tab === "Orders") && (
            <div className="flex gap-1.5">
              {RANGES.map(([d, l]) => (
                <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={`press rounded-full border-[1.5px] px-4 py-2 text-[13px] font-bold ${days === d ? "border-ink bg-ink text-white" : "border-[#e2e2dc] bg-white"}`}>{l}</button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          {tab === "Overview" && <OverviewTab slug={slug} pin={pin} days={days} onGoOrders={() => setTab("Orders")} onAuthError={authError} />}
          {tab === "Orders" && <OrdersTab slug={slug} pin={pin} days={days} onAuthError={authError} />}
          {tab === "Menu" && <MenuTab slug={slug} pin={pin} onAuthError={authError} />}
          {tab === "Inventory" && <InventoryTab slug={slug} pin={pin} onAuthError={authError} />}
          {tab === "Tables & QR" && <TablesTab slug={slug} pin={pin} onAuthError={authError} />}
          {tab === "Settings" && <SettingsTab slug={slug} pin={pin} onPinChanged={setPin} />}
        </div>
      </main>
    </div>
  );
};
