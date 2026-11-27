"use client";

import { formatINR } from "@/lib/money";
import type { Category, MenuItem } from "@/lib/types";
import { DishArt, Icon, Svg, shortName } from "./ui";
import { DishDial } from "./DishDial";

type Props = {
  categories: Category[];
  categoryId: string;
  onCategory: (id: string) => void;
  items: MenuItem[];
  item: MenuItem;
  onItem: (id: string) => void;
  tableLabel: string;
  cartCount: number;
  fav: boolean;
  onFav: () => void;
  onCustomize: () => void;
  onQuickAdd: () => void;
  onCart: () => void;
  onStatus: () => void;
  hasOrder: boolean;
};

export const MenuScreen = (p: Props) => {
  const pick = (id: string) => p.onItem(id);

  return (
    <div className="screen relative mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-cream">
      <header className="flex items-center justify-between px-[18px] pt-[18px]">
        <button type="button" aria-label="Menu categories" className="press flex h-12 w-12 items-center justify-center rounded-2xl border border-ink/10 bg-white shadow-[0_6px_16px_rgba(80,40,10,0.08)]">
          <Svg>{Icon.grid}</Svg>
        </button>
        <div className="text-center">
          <p className="font-display text-xl font-extrabold tracking-tight">Chackos</p>
          <p className="text-[11px] font-semibold text-[#8a7c6e]">Table {p.tableLabel.replace(/^T-0?/, "")} · Dine-in</p>
        </div>
        <button type="button" onClick={p.onCart} aria-label={`View order, ${p.cartCount} items`} className="press relative flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white shadow-[0_8px_18px_rgba(23,18,14,0.25)]">
          <Svg size={21} stroke="#fff" width={1.9}>{Icon.bag}</Svg>
          {p.cartCount > 0 && (
            <span className="absolute -right-[3px] -top-[3px] flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-cream bg-ember px-[5px] text-[11px] font-bold text-white">{p.cartCount}</span>
          )}
        </button>
      </header>

      <nav aria-label="Categories" className="no-scrollbar mt-3 flex shrink-0 gap-1 overflow-x-auto px-3.5">
        {p.categories.map((c) => {
          const active = c.id === p.categoryId;
          return (
            <button key={c.id} type="button" aria-pressed={active} onClick={() => p.onCategory(c.id)} className={`flex min-h-11 shrink-0 flex-col items-center justify-center gap-1.5 px-2.5 text-sm ${active ? "font-bold text-ink" : "font-semibold text-[#a99c8f]"}`}>
              {c.name}
              <span className={`h-[3px] w-[22px] rounded-full ${active ? "bg-ember" : "bg-transparent"}`} />
            </button>
          );
        })}
      </nav>

      <section className="relative min-h-0 flex-1" aria-label="Dishes">
        <div className="absolute inset-y-0 left-0 z-10 flex w-[96px] flex-col gap-3 overflow-y-auto px-3.5 py-3 no-scrollbar">
          {p.items.map((it) => {
            const active = it.id === p.item.id;
            return (
              <button
                key={it.id}
                type="button"
                aria-label={shortName(it.name)}
                aria-pressed={active}
                onClick={() => pick(it.id)}
                className={`press flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[22px] transition-[background,box-shadow] ${active ? "bg-[#fbd9c8] shadow-[0_0_0_3px_rgba(228,87,46,0.35),0_8px_18px_rgba(228,87,46,0.18)]" : "bg-white shadow-[0_6px_14px_rgba(80,40,10,0.08)]"} ${it.isAvailable ? "" : "opacity-40"}`}
              >
                <span className="flex h-[54px] w-[54px] items-center justify-center">
                  <DishArt item={it} sizes="54px" />
                </span>
              </button>
            );
          })}
        </div>

        <DishDial items={p.items} activeId={p.item.id} onChange={pick} />
      </section>

      <div className="flex items-end gap-2.5 px-[22px] pt-1">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[27px] font-extrabold leading-[1.05] tracking-[-0.02em]">{shortName(p.item.name)}</h1>
          <p className="mt-1 truncate text-[12.5px] leading-[1.4] text-muted">{[p.item.prepTime, p.item.description].filter(Boolean).join(" · ")}</p>
        </div>
        <button type="button" onClick={p.onFav} aria-label={`Save ${shortName(p.item.name)}`} aria-pressed={p.fav} className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink/15 bg-white">
          <Svg size={18} fill={p.fav ? "#E4572E" : "none"} stroke={p.fav ? "#E4572E" : "#17120E"}>{Icon.heart}</Svg>
        </button>
      </div>

      <div className="px-3.5 pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
        <nav aria-label="Order" className="flex h-[66px] items-center gap-1.5 rounded-full bg-ink pl-[22px] pr-1.5 shadow-[0_16px_30px_rgba(23,18,14,0.3)]">
          <div className="shrink-0 text-white">
            <p className="font-display text-2xl font-extrabold leading-none tracking-[-0.02em] tabular-nums">{formatINR(p.item.pricePaise)}</p>
            <p className="mt-[3px] text-[10.5px] font-semibold text-[#9c9187]">Starting price</p>
          </div>
          <button type="button" onClick={p.onStatus} aria-label="Order status" className="press relative ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#cfc4b8]">
            <Svg size={21}>{Icon.receipt}</Svg>
            {p.hasOrder && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-ember" />}
          </button>
          <button type="button" onClick={p.onCustomize} disabled={!p.item.isAvailable} className="press flex h-[54px] shrink-0 items-center rounded-full bg-white px-5 text-[15px] font-bold text-ink disabled:opacity-50">
            {p.item.isAvailable ? "Customize" : "Sold out"}
          </button>
          <button type="button" onClick={p.onQuickAdd} aria-label={`Quick add ${shortName(p.item.name)}`} disabled={!p.item.isAvailable} className="press flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-ember text-white disabled:opacity-50">
            <Svg size={20} stroke="#fff" width={2.6}>{Icon.plus}</Svg>
          </button>
        </nav>
      </div>
    </div>
  );
};
