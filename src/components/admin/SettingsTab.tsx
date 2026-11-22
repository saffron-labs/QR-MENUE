"use client";

import { useState } from "react";
import { setStaffPin } from "@/lib/admin";

type Props = { slug: string; pin: string; onPinChanged: (pin: string) => void };
const ROLES = [["kitchen", "Kitchen PIN"], ["attendant", "Attendant PIN"], ["admin", "Admin PIN"]] as const;

const PinRow = ({ slug, pin, role, label, onPinChanged }: Props & { role: string; label: string }) => {
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    try {
      await setStaffPin(slug, pin, role, value);
      if (role === "admin") onPinChanged(value);
      setValue(""); setMsg("Saved.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
  };
  return (
    <div className="rounded-[24px] bg-surface p-5">
      <label className="block text-xs font-semibold">{label} (4–8 digits)
        <input value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="off" className="mt-1 block w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm" />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={save} disabled={value.length < 4} className="press rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream disabled:opacity-40">Change PIN</button>
        {msg && <span role="status" className="text-xs font-semibold text-muted">{msg}</span>}
      </div>
    </div>
  );
};

const Info = ({ title, rows }: { title: string; rows: [string, string][] }) => (
  <div className="rounded-[24px] bg-surface p-5">
    <h2 className="text-base font-bold">{title}</h2>
    <dl className="mt-3 space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-[13px]"><dt className="font-semibold text-muted">{k}</dt><dd className="text-right font-bold">{v}</dd></div>
      ))}
    </dl>
  </div>
);

export const SettingsTab = (props: Props) => (
  <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-3">
      {ROLES.map(([role, label]) => <PinRow key={role} {...props} role={role} label={label} />)}
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <Info title="Table rules" rows={[["Auto-close after the bill", "45 min with no new orders"], ["Auto-close when idle", "3 hours"], ["Party size on first scan", "1 to 12"]]} />
      <Info title="Bill & tax" rows={[["GST", "5% (CGST 2.5% + SGST 2.5%)"], ["Bill numbers", "B-0001 and up"], ["Currency", "INR (₹)"]]} />
    </div>
  </div>
);
