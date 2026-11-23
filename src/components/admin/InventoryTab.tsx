"use client";

import { useCallback, useMemo, useState } from "react";
import {
  deleteInvItem, fetchInventory, inventoryQuickstart, moveStock, saveInvItem, saveRecipe,
  type InvDish, type InvItem, type InvStatus, type InvUnit, type Inventory, type StockMode,
} from "@/lib/admin";
import { formatINR } from "@/lib/money";
import { useLoad } from "./useLoad";

type Props = { slug: string; pin: string; onAuthError: () => void };
type Sub = "stock" | "recipes" | "shopping" | "log";
type Dialog =
  | { kind: "move"; item: InvItem; mode: StockMode }
  | { kind: "item"; item: InvItem | null }
  | { kind: "recipe"; dish: InvDish }
  | null;

const UNITS: InvUnit[] = ["kg", "g", "l", "ml", "pcs", "pack"];
const field = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm";
const STATUS: Record<InvStatus, { label: string; chip: string; bar: string }> = {
  ok: { label: "In stock", chip: "bg-emerald-100 text-emerald-800", bar: "bg-ink" },
  low: { label: "Low", chip: "bg-amber-100 text-amber-800", bar: "bg-amber-400" },
  out: { label: "Out", chip: "bg-peach text-[#a8351a]", bar: "bg-ember" },
};
const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-IN");
const MOVE_TITLE: Record<StockMode, string> = { purchase: "Receive stock", waste: "Record waste", count: "Count stock", adjust: "Adjust stock" };
const REASON: Record<string, string> = { opening: "Opening stock", purchase: "Received", sale: "Sold", cancel: "Order cancelled", waste: "Waste", adjust: "Adjusted", count: "Counted" };

const Summary = ({ d }: { d: Inventory }) => {
  const low = d.items.filter((i) => i.status === "low").length;
  const out = d.items.filter((i) => i.status === "out").length;
  const value = d.items.reduce((s, i) => s + i.valuePaise, 0);
  const tiles: [string, string, string][] = [
    ["Items tracked", String(d.items.length), ""],
    ["Running low", String(low), low ? "text-amber-700" : ""],
    ["Out of stock", String(out), out ? "text-ember" : ""],
    ["Stock value", formatINR(value), ""],
    ["Waste this week", formatINR(d.wasteWeekPaise), ""],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {tiles.map(([l, v, c]) => (
        <div key={l} className="rounded-[22px] bg-surface p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{l}</p>
          <p className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${c}`}>{v}</p>
        </div>
      ))}
    </div>
  );
};

const StockList = ({ d, onDialog }: { d: Inventory; onDialog: (x: Dialog) => void }) => {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "attention">("all");
  const rows = d.items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()) && (only === "all" || i.status !== "ok"));
  const btn = "press rounded-full border-[1.5px] border-[#e2e2dc] bg-white px-3 py-1.5 text-xs font-bold";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Search items" className={`${field} max-w-xs`} placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" aria-pressed={only === "attention"} onClick={() => setOnly(only === "all" ? "attention" : "all")} className={`press rounded-full border-[1.5px] px-4 py-2 text-[13px] font-bold ${only === "attention" ? "border-ink bg-ink text-white" : "border-[#e2e2dc] bg-white"}`}>Needs attention</button>
        <button type="button" onClick={() => onDialog({ kind: "item", item: null })} className="press ml-auto rounded-full bg-ember px-5 py-2.5 text-sm font-bold text-white">Add item</button>
      </div>
      {rows.length === 0 && <p className="rounded-2xl bg-surface p-5 text-sm font-semibold text-muted">Nothing here.</p>}
      <ul className="grid gap-2.5 lg:grid-cols-2">
        {rows.map((i) => {
          const s = STATUS[i.status];
          const pct = i.reorderLevel > 0 ? Math.min(100, (Math.max(i.qty, 0) / (i.reorderLevel * 2)) * 100) : i.qty > 0 ? 100 : 0;
          return (
            <li key={i.id} className="rounded-[22px] bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => onDialog({ kind: "item", item: i })} className="min-w-0 text-left">
                  <span className="block truncate font-bold">{i.name}</span>
                  <span className="text-xs text-muted">{i.category ?? "Uncategorised"}{i.supplier ? ` · ${i.supplier}` : ""}{i.dishes ? ` · used in ${i.dishes} dish${i.dishes > 1 ? "es" : ""}` : ""}</span>
                </button>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${s.chip}`}>{s.label}</span>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <p className="font-display text-2xl font-extrabold tabular-nums">{num(i.qty)} <span className="text-sm font-semibold text-muted">{i.unit}</span></p>
                <p className="text-right text-xs text-muted">{i.daysLeft != null ? `~${i.daysLeft} days left` : "no usage yet"}{i.reorderLevel > 0 ? ` · reorder at ${num(i.reorderLevel)}` : ""}</p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white"><div className={`h-2 rounded-full ${s.bar}`} style={{ width: `${pct}%` }} /></div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button type="button" className={btn} onClick={() => onDialog({ kind: "move", item: i, mode: "purchase" })}>Receive</button>
                <button type="button" className={btn} onClick={() => onDialog({ kind: "move", item: i, mode: "waste" })}>Waste</button>
                <button type="button" className={btn} onClick={() => onDialog({ kind: "move", item: i, mode: "count" })}>Count</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const Recipes = ({ d, onDialog }: { d: Inventory; onDialog: (x: Dialog) => void }) => {
  const cats = [...new Set(d.dishes.map((x) => x.categoryName))];
  const done = d.dishes.filter((x) => x.recipe.length > 0).length;
  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-surface p-4 text-sm text-[#55554f]">Link each dish to the ingredients it uses. Once a dish has a recipe, every order uses up its ingredients automatically and the dish switches itself off when one runs out. <b>{done} of {d.dishes.length} dishes set up.</b></p>
      {cats.map((c) => (
        <section key={c}>
          <h3 className="mb-2 text-base font-bold">{c}</h3>
          <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {d.dishes.filter((x) => x.categoryName === c).map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => onDialog({ kind: "recipe", dish: x })} className="press flex w-full items-center justify-between gap-3 rounded-[18px] bg-surface p-3.5 text-left">
                  <span className="min-w-0"><span className="block truncate text-sm font-bold">{x.name}</span><span className="text-xs text-muted">{x.recipe.length ? `${x.recipe.length} ingredient${x.recipe.length > 1 ? "s" : ""}` : "No recipe yet"}{x.stockDisabled ? " · off: out of stock" : ""}</span></span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${x.recipe.length ? "bg-emerald-100 text-emerald-800" : "bg-white text-muted"}`}>{x.recipe.length ? "Set" : "Add"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

const Shopping = ({ d }: { d: Inventory }) => {
  const rows = d.items.filter((i) => i.status !== "ok").map((i) => {
    const target = i.reorderLevel > 0 ? i.reorderLevel * 2 : Math.max(i.used7d, 1);
    return { i, need: Math.max(0, target - Math.max(i.qty, 0)) };
  });
  const [copied, setCopied] = useState(false);
  const text = rows.map(({ i, need }) => `${i.name}: ${num(need)} ${i.unit}${i.supplier ? ` (${i.supplier})` : ""}`).join("\n");
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ } };
  if (rows.length === 0) return <p className="rounded-2xl bg-surface p-5 text-sm font-semibold text-muted">Nothing to buy. Everything is above its reorder level.</p>;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 print:hidden">
        <button type="button" onClick={copy} className="press rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white">{copied ? "Copied" : "Copy list"}</button>
        <button type="button" onClick={() => window.print()} className="press rounded-full border-[1.5px] border-[#e2e2dc] bg-white px-5 py-2.5 text-sm font-bold">Print</button>
      </div>
      <ul className="divide-y divide-[#ececE6] rounded-[22px] bg-surface">
        {rows.map(({ i, need }) => (
          <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="min-w-0"><span className="block truncate font-bold">{i.name}</span><span className="text-xs text-muted">{STATUS[i.status].label} · {num(Math.max(i.qty, 0))} {i.unit} on hand{i.supplier ? ` · ${i.supplier}` : ""}</span></span>
            <span className="shrink-0 font-display text-lg font-extrabold tabular-nums">{num(need)} {i.unit}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Suggested to bring each item up to twice its reorder level (items with no reorder level use last week&apos;s usage).</p>
    </div>
  );
};

const Log = ({ d }: { d: Inventory }) => {
  if (d.movements.length === 0) return <p className="rounded-2xl bg-surface p-5 text-sm font-semibold text-muted">No stock changes yet.</p>;
  return (
    <ul className="divide-y divide-[#ececE6] rounded-[22px] bg-surface">
      {d.movements.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0"><span className="block truncate text-sm font-bold">{m.itemName}</span><span className="text-xs text-muted">{REASON[m.reason]}{m.orderNumber ? ` · order #${m.orderNumber}` : ""}{m.note ? ` · ${m.note}` : ""} · {new Date(m.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></span>
          <span className={`shrink-0 text-sm font-bold tabular-nums ${m.delta < 0 ? "text-ember" : "text-emerald-700"}`}>{m.delta > 0 ? "+" : ""}{num(m.delta)} {m.unit}</span>
        </li>
      ))}
    </ul>
  );
};

type Ctx = { slug: string; pin: string; done: () => Promise<void>; close: () => void; setMsg: (s: string | null) => void };
const Shell = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 sm:items-center" onClick={onClose}>
    <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-3xl bg-cream p-5">
      <h2 className="font-display text-xl font-extrabold">{title}</h2>
      {children}
    </div>
  </div>
);
const Actions = ({ onClose, onSave, label = "Save", extra }: { onClose: () => void; onSave: () => void; label?: string; extra?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 pt-1">
    <div>{extra}</div>
    <div className="flex gap-2">
      <button type="button" onClick={onClose} className="press rounded-full border-[1.5px] border-[#e2e2dc] bg-white px-5 py-2.5 text-sm font-bold">Cancel</button>
      <button type="button" onClick={onSave} className="press rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white">{label}</button>
    </div>
  </div>
);

const MoveDialog = ({ item, mode, c }: { item: InvItem; mode: StockMode; c: Ctx }) => {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [cost, setCost] = useState(item.costPaise ? String(item.costPaise / 100) : "");
  const submit = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || qty.trim() === "") { c.setMsg("Enter a quantity."); return; }
    try {
      const paise = mode === "purchase" && cost.trim() !== "" ? Math.round(Number(cost) * 100) : null;
      await moveStock(c.slug, c.pin, item.id, mode, n, note, paise);
      c.close(); c.setMsg(null); await c.done();
    } catch (e) { c.setMsg(e instanceof Error ? e.message : "Could not save."); }
  };
  const hint = mode === "count" ? `Counted right now (system says ${num(item.qty)} ${item.unit})` : mode === "purchase" ? "Quantity received" : "Quantity wasted";
  return (
    <Shell title={`${MOVE_TITLE[mode]} · ${item.name}`} onClose={c.close}>
      <label className="block text-xs font-semibold">{hint} ({item.unit})<input autoFocus className={field} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      {mode === "purchase" && <label className="block text-xs font-semibold">Price per {item.unit} (₹), optional<input className={field} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>}
      <label className="block text-xs font-semibold">Note, optional<input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "waste" ? "Spoiled, spilled, expired…" : mode === "purchase" ? "Supplier or bill number" : ""} /></label>
      <Actions onClose={c.close} onSave={submit} label={MOVE_TITLE[mode]} />
    </Shell>
  );
};

const ItemDialog = ({ item, c }: { item: InvItem | null; c: Ctx }) => {
  const [f, setF] = useState({ name: item?.name ?? "", unit: (item?.unit ?? "kg") as InvUnit, category: item?.category ?? "", supplier: item?.supplier ?? "", reorder: item ? String(item.reorderLevel) : "", cost: item?.costPaise ? String(item.costPaise / 100) : "", qty: "" });
  const [confirm, setConfirm] = useState(false);
  const submit = async () => {
    try {
      await saveInvItem(c.slug, c.pin, { id: item?.id, name: f.name, unit: f.unit, category: f.category, supplier: f.supplier, reorderLevel: Number(f.reorder) || 0, costPaise: Math.round((Number(f.cost) || 0) * 100), qty: item ? undefined : Number(f.qty) || 0 });
      c.close(); c.setMsg(null); await c.done();
    } catch (e) { c.setMsg(e instanceof Error ? e.message : "Could not save."); }
  };
  const remove = async () => {
    if (!item) return;
    try { await deleteInvItem(c.slug, c.pin, item.id); c.close(); c.setMsg(null); await c.done(); } catch (e) { c.setMsg(e instanceof Error ? e.message : "Could not remove."); }
  };
  return (
    <Shell title={item ? "Edit item" : "Add item"} onClose={c.close}>
      <label className="block text-xs font-semibold">Name<input autoFocus className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold">Unit<select className={field} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as InvUnit })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></label>
        <label className="block text-xs font-semibold">Category<input className={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Meat, Dry goods…" /></label>
        <label className="block text-xs font-semibold">Reorder level ({f.unit})<input className={field} inputMode="decimal" value={f.reorder} onChange={(e) => setF({ ...f, reorder: e.target.value })} /></label>
        <label className="block text-xs font-semibold">Cost per {f.unit} (₹)<input className={field} inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></label>
      </div>
      <label className="block text-xs font-semibold">Supplier<input className={field} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></label>
      {!item && <label className="block text-xs font-semibold">Opening stock ({f.unit})<input className={field} inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>}
      <Actions onClose={c.close} onSave={submit} extra={item && (confirm
        ? <button type="button" onClick={remove} className="press rounded-full bg-ember px-4 py-2.5 text-sm font-bold text-white">Remove {item.name}?</button>
        : <button type="button" onClick={() => setConfirm(true)} className="press rounded-full px-3 py-2.5 text-sm font-bold text-ember">Remove</button>)} />
    </Shell>
  );
};

const RecipeDialog = ({ dish, items, c }: { dish: InvDish; items: InvItem[]; c: Ctx }) => {
  const [lines, setLines] = useState<{ itemId: string; qty: string }[]>(dish.recipe.map((r) => ({ itemId: r.itemId, qty: String(r.qty) })));
  const unused = items.filter((i) => !lines.some((l) => l.itemId === i.id));
  const submit = async () => {
    try {
      await saveRecipe(c.slug, c.pin, dish.id, lines.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })).filter((l) => l.qty > 0));
      c.close(); c.setMsg(null); await c.done();
    } catch (e) { c.setMsg(e instanceof Error ? e.message : "Could not save."); }
  };
  return (
    <Shell title={`Recipe · ${dish.name}`} onClose={c.close}>
      <p className="text-xs text-muted">How much of each ingredient goes into one portion.</p>
      <ul className="space-y-2">
        {lines.map((l) => {
          const it = items.find((i) => i.id === l.itemId);
          return (
            <li key={l.itemId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{it?.name}</span>
              <input aria-label={`${it?.name} per portion`} className={`${field} !w-24`} inputMode="decimal" value={l.qty} onChange={(e) => setLines(lines.map((x) => (x.itemId === l.itemId ? { ...x, qty: e.target.value } : x)))} />
              <span className="w-8 text-xs text-muted">{it?.unit}</span>
              <button type="button" aria-label={`Remove ${it?.name}`} onClick={() => setLines(lines.filter((x) => x.itemId !== l.itemId))} className="press px-1 text-lg font-bold text-muted">×</button>
            </li>
          );
        })}
      </ul>
      {unused.length > 0 && (
        <select aria-label="Add ingredient" className={field} value="" onChange={(e) => e.target.value && setLines([...lines, { itemId: e.target.value, qty: "" }])}>
          <option value="">Add an ingredient…</option>
          {unused.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
        </select>
      )}
      {items.length === 0 && <p className="text-sm font-semibold text-ember">Add ingredients on the Stock tab first.</p>}
      <Actions onClose={c.close} onSave={submit} />
    </Shell>
  );
};

export const InventoryTab = ({ slug, pin, onAuthError }: Props) => {
  const load = useCallback(() => fetchInventory(slug, pin), [slug, pin]);
  const { data, error, reload } = useLoad(load, onAuthError);
  const [sub, setSub] = useState<Sub>("stock");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ctx: Ctx = useMemo(() => ({ slug, pin, done: reload, close: () => setDialog(null), setMsg }), [slug, pin, reload]);

  if (error) return <p className="text-sm font-semibold text-ember">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const quickstart = async () => { try { await inventoryQuickstart(slug, pin); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : "Could not add."); } };
  const attention = data.items.filter((i) => i.status !== "ok").length;
  const SUBS: [Sub, string][] = [["stock", "Stock"], ["recipes", "Recipes"], ["shopping", `Shopping list${attention ? ` · ${attention}` : ""}`], ["log", "Activity"]];

  return (
    <div className="space-y-5">
      {msg && <p role="status" className="text-sm font-semibold text-ember">{msg}</p>}
      {data.items.length === 0 ? (
        <div className="rounded-[26px] bg-surface p-7">
          <h3 className="font-display text-xl font-extrabold">Start tracking your stock</h3>
          <p className="mt-1.5 max-w-xl text-sm text-[#55554f]">Add the ingredients you buy, link them to dishes, and Chackos will count them down on every order and switch a dish off when it runs out.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={quickstart} className="press rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white">Add common ingredients</button>
            <button type="button" onClick={() => setDialog({ kind: "item", item: null })} className="press rounded-full border-[1.5px] border-[#e2e2dc] bg-white px-5 py-2.5 text-sm font-bold">Add one myself</button>
          </div>
        </div>
      ) : (
        <>
          <Summary d={data} />
          <nav className="flex gap-1.5 overflow-x-auto rounded-full bg-[#f3f3ef] p-1.5 no-scrollbar print:hidden" aria-label="Inventory sections">
            {SUBS.map(([k, l]) => <button key={k} type="button" aria-current={sub === k} onClick={() => setSub(k)} className={`press shrink-0 rounded-full px-[18px] py-2 text-[13px] font-bold ${sub === k ? "bg-ink text-white" : "text-[#55554f]"}`}>{l}</button>)}
          </nav>
          {sub === "stock" && <StockList d={data} onDialog={setDialog} />}
          {sub === "recipes" && <Recipes d={data} onDialog={setDialog} />}
          {sub === "shopping" && <Shopping d={data} />}
          {sub === "log" && <Log d={data} />}
        </>
      )}
      {dialog?.kind === "move" && <MoveDialog item={dialog.item} mode={dialog.mode} c={ctx} />}
      {dialog?.kind === "item" && <ItemDialog item={dialog.item} c={ctx} />}
      {dialog?.kind === "recipe" && <RecipeDialog dish={dialog.dish} items={data.items} c={ctx} />}
    </div>
  );
};
