"use client";

import { useCallback, useState } from "react";
import { deleteItem, fetchAdminMenu, saveItem, type AdminItem } from "@/lib/admin";
import { formatINR } from "@/lib/money";
import { useLoad } from "./useLoad";

type Draft = { id?: string; name: string; description: string; price: string; categoryId: string; available: boolean };
type Props = { slug: string; pin: string; onAuthError: () => void };

const field = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm";

export const MenuTab = ({ slug, pin, onAuthError }: Props) => {
  const load = useCallback(() => fetchAdminMenu(slug, pin), [slug, pin]);
  const { data, error, reload } = useLoad(load, onAuthError);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const edit = (i: AdminItem) => setDraft({ id: i.id, name: i.name, description: i.description ?? "", price: String(i.pricePaise / 100), categoryId: i.categoryId, available: i.available });
  const blank = (categoryId: string): Draft => ({ name: "", description: "", price: "", categoryId, available: true });

  const save = async () => {
    if (!draft) return;
    const rupees = Number(draft.price);
    if (!Number.isFinite(rupees) || rupees < 0) { setMsg("Enter a valid price."); return; }
    try {
      await saveItem(slug, pin, { id: draft.id, name: draft.name, description: draft.description, pricePaise: Math.round(rupees * 100), categoryId: draft.categoryId, available: draft.available });
      setDraft(null); setMsg(null); await reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
  };
  const toggle = async (i: AdminItem) => {
    try { await saveItem(slug, pin, { ...i, available: !i.available }); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : "Could not update."); }
  };
  const remove = async (id: string) => {
    try { await deleteItem(slug, pin, id); setConfirmDel(null); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : "Could not delete."); }
  };

  if (error) return <p className="text-sm font-semibold text-ember">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const firstCat = data.categories[0]?.id ?? "";

  return (
    <div className="space-y-5">
      {msg && <p role="status" className="text-sm font-semibold text-ember">{msg}</p>}
      <button type="button" onClick={() => setDraft(blank(firstCat))} className="press rounded-full bg-ember px-5 py-2.5 text-sm font-bold text-white">Add dish</button>
      {data.categories.map((c) => (
        <section key={c.id}>
          <h2 className="mb-2.5 text-base font-bold">{c.name} <span className="text-sm font-semibold text-muted">· {data.items.filter((i) => i.categoryId === c.id).length}</span></h2>
          <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {data.items.filter((i) => i.categoryId === c.id).map((i) => (
              <li key={i.id} className="flex items-center gap-3 rounded-[22px] bg-surface p-3.5">
                <button type="button" onClick={() => edit(i)} className="min-w-0 flex-1 text-left">
                  <span className={`block truncate font-semibold ${i.available ? "" : "text-muted line-through"}`}>{i.name}</span>
                  <span className="text-xs text-muted tabular-nums">{formatINR(i.pricePaise)}</span>
                </button>
                <button type="button" role="switch" aria-checked={i.available} aria-label={`${i.name} available`} onClick={() => toggle(i)} className={`press h-7 w-12 shrink-0 rounded-full p-0.5 ${i.available ? "bg-ink" : "bg-ink/20"}`}>
                  <span className={`block h-6 w-6 rounded-full transition-transform ${i.available ? "translate-x-5 bg-lime" : "bg-white"}`} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 sm:items-center" onClick={() => setDraft(null)}>
          <div role="dialog" aria-label={draft.id ? "Edit dish" : "Add dish"} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-3xl bg-cream p-5">
            <h2 className="font-display text-xl font-extrabold">{draft.id ? "Edit dish" : "Add dish"}</h2>
            <label className="block text-xs font-semibold">Name<input className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="block text-xs font-semibold">Description<textarea className={field} rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold">Price (₹)<input className={field} inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></label>
              <label className="block text-xs font-semibold">Category
                <select className={field} value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                  {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              {draft.id ? (
                confirmDel === draft.id
                  ? <button type="button" onClick={() => { void remove(draft.id!); setDraft(null); }} className="press rounded-full bg-ember px-4 py-2 text-sm font-bold text-white">Delete {draft.name}</button>
                  : <button type="button" onClick={() => setConfirmDel(draft.id!)} className="press px-2 py-2 text-sm font-semibold text-ember">Delete dish</button>
              ) : <span />}
              <span className="flex gap-2">
                <button type="button" onClick={() => setDraft(null)} className="press rounded-full px-4 py-2 text-sm font-semibold">Cancel</button>
                <button type="button" onClick={save} className="press rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream">Save dish</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
