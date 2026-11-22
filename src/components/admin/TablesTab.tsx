"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { addTable, fetchAdminTables, rotateToken, type AdminTable } from "@/lib/admin";
import { useLoad } from "./useLoad";

type Props = { slug: string; pin: string; onAuthError: () => void };

const QrCard = ({ slug, table, onRotate }: { slug: string; table: AdminTable; onRotate: () => void }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(`${window.location.origin}/r/${slug}/t/${table.token}`, { margin: 1, width: 360, errorCorrectionLevel: "M" }).then((u) => { if (live) setSrc(u); });
    return () => { live = false; };
  }, [slug, table.token]);
  return (
    <li className="break-inside-avoid rounded-2xl bg-white p-4 text-center print:border print:border-ink/20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={`QR code for ${table.label}`} className="mx-auto h-40 w-40" /> : <div className="mx-auto h-40 w-40" />}
      <p className="mt-2 font-display text-xl font-extrabold">{table.label}</p>
      <p className="text-xs text-muted print:hidden">Scan to order</p>
      <div className="mt-2 print:hidden">
        {confirm
          ? <button type="button" onClick={() => { setConfirm(false); onRotate(); }} className="press text-xs font-bold text-ember">Replace QR — old print stops working</button>
          : <button type="button" onClick={() => setConfirm(true)} className="press text-xs font-semibold text-muted">New QR code</button>}
      </div>
    </li>
  );
};

export const TablesTab = ({ slug, pin, onAuthError }: Props) => {
  const load = useCallback(() => fetchAdminTables(slug, pin), [slug, pin]);
  const { data, error, reload } = useLoad(load, onAuthError);
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const add = async () => {
    try { await addTable(slug, pin, label); setLabel(""); setMsg(null); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : "Could not add."); }
  };
  const rotate = async (id: string) => {
    try { await rotateToken(slug, pin, id); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : "Could not update."); }
  };

  if (error) return <p className="text-sm font-semibold text-ember">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="text-xs font-semibold">New table name
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="T-15" className="mt-1 block w-32 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm" />
        </label>
        <button type="button" onClick={add} className="press rounded-full bg-ember px-4 py-2 text-sm font-bold text-white">Add table</button>
        <button type="button" onClick={() => window.print()} className="press rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream">Print all QR codes</button>
      </div>
      {msg && <p role="status" className="text-sm font-semibold text-ember print:hidden">{msg}</p>}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-3">
        {data.tables.map((t) => <QrCard key={t.id} slug={slug} table={t} onRotate={() => rotate(t.id)} />)}
      </ul>
    </div>
  );
};
