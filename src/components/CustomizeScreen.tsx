"use client";

import Image from "next/image";
import { useState } from "react";
import { defaultOptionIds, lineUnitPaise, optionArt } from "@/lib/cart";
import { formatINR } from "@/lib/money";
import type { MenuItem, ModifierGroup } from "@/lib/types";
import { DishArt, Icon, Qty, Svg, shortName } from "./ui";

type Props = {
  item: MenuItem;
  fav: boolean;
  onFav: () => void;
  onBack: () => void;
  onAdd: (line: { itemId: string; qty: number; optionIds: string[]; notes: string }) => void;
};

const isChoice = (g: ModifierGroup) => g.minSelect === 1 && g.maxSelect === 1;

export const CustomizeScreen = ({ item, fav, onFav, onBack, onAdd }: Props) => {
  const [optionIds, setOptionIds] = useState<string[]>(() => defaultOptionIds(item));
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");

  const choose = (group: ModifierGroup, id: string) =>
    setOptionIds((prev) => [...prev.filter((x) => !group.options.some((o) => o.id === x)), id]);
  const toggle = (group: ModifierGroup, id: string) =>
    setOptionIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const picked = prev.filter((x) => group.options.some((o) => o.id === x)).length;
      return picked >= group.maxSelect ? prev : [...prev, id];
    });

  const unit = lineUnitPaise(item, optionIds);
  const chosenNames = item.groups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id)).map((o) => o.name);
  const bowls = [
    { match: "mayo", src: "/menu/mayo.webp", pos: "-left-9 bottom-1 h-[84px] w-[84px]" },
    { match: "tomato", src: "/menu/chutney.webp", pos: "-right-8 top-1.5 h-[76px] w-[76px]" },
    { match: "mint", src: "/menu/mint.webp", pos: "-right-6 -bottom-1.5 h-[70px] w-[70px]" },
  ];
  const bread = chosenNames.find((n) => /porotta|rumali/i.test(n));
  const breadArt = bread ? optionArt(bread) : null;

  return (
    <div className="screen relative mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-[linear-gradient(160deg,#F9D9C6_0%,#F4EDE4_46%,#EFE6DA_100%)]">
      <span aria-hidden="true" className="pointer-events-none absolute -left-20 -top-16 h-[300px] w-[300px] rounded-full bg-ember/20 blur-[40px]" />
      <header className="relative z-10 flex items-center justify-between px-[18px] pt-[18px]">
        <button type="button" onClick={onBack} aria-label="Back to menu" className="press flex h-12 w-12 items-center justify-center rounded-2xl border border-white/90 bg-white/75 shadow-[0_6px_16px_rgba(80,40,10,0.08)]"><Svg>{Icon.back}</Svg></button>
        <p className="text-[13px] font-bold">Customize</p>
        <button type="button" onClick={onFav} aria-pressed={fav} aria-label="Save dish" className="press flex h-12 w-12 items-center justify-center rounded-2xl border border-white/90 bg-white/75 shadow-[0_6px_16px_rgba(80,40,10,0.08)]">
          <Svg fill={fav ? "#E4572E" : "none"} stroke={fav ? "#E4572E" : "#17120E"}>{Icon.heart}</Svg>
        </button>
      </header>

      <div className="relative flex h-[250px] shrink-0 items-center justify-center">
        <div className="relative h-[220px] w-[220px] motion-safe:animate-[bob_5s_ease-in-out_infinite]" style={{ filter: "drop-shadow(0 28px 30px rgba(90,40,10,0.32))" }}>
          <DishArt item={item} priority sizes="220px" />
          {bowls.map((b) =>
            chosenNames.some((n) => n.toLowerCase().includes(b.match)) ? (
              <Image key={b.match} src={b.src} alt="" width={84} height={84} className={`pop absolute object-contain drop-shadow-[0_14px_14px_rgba(90,40,10,0.28)] ${b.pos}`} />
            ) : null,
          )}
          {breadArt && (
            <span key={breadArt} className="pop absolute -left-3 top-2 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-white shadow-[0_10px_18px_rgba(90,40,10,0.2)]">
              <Image src={breadArt} alt="" width={50} height={50} className="object-contain" />
            </span>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col rounded-t-[34px] bg-white shadow-[0_-14px_40px_rgba(80,40,10,0.12)]">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded bg-ink/10" aria-hidden="true" />
        <div className="px-[22px] pt-3">
          <h1 className="font-display text-[28px] font-extrabold leading-none tracking-[-0.02em]">{shortName(item.name)}</h1>
          <p className="mt-1.5 text-xs font-semibold text-[#8a7c6e]">{item.prepTime ? `Ready in ${item.prepTime}` : "Freshly made"}</p>
        </div>

        <div className="no-scrollbar flex-1 space-y-[22px] overflow-y-auto px-[22px] pb-4 pt-4">
          {item.groups.map((g) => (
            <section key={g.id}>
              <h2 className="mb-2.5 text-[13px] font-bold">
                {g.name}
                {!isChoice(g) && g.options[0] && g.options[0].priceDeltaPaise > 0 && <span className="font-medium text-[#9a8d80]"> · +{formatINR(g.options[0].priceDeltaPaise)} each</span>}
              </h2>
              {isChoice(g) ? (
                <div role="radiogroup" aria-label={g.name} className="grid grid-cols-2 gap-2">
                  {g.options.map((o) => {
                    const on = optionIds.includes(o.id);
                    const art = optionArt(o.name);
                    return (
                      <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => choose(g, o.id)} className={`press flex min-h-16 items-center gap-2 rounded-[18px] border-[1.5px] py-2 pl-2 pr-3 text-left text-[13px] font-bold ${on ? "border-ember bg-[#fff4ee]" : "border-ink/10 bg-white"}`}>
                        {art && <Image src={art} alt="" width={48} height={48} className="h-12 w-12 shrink-0 object-contain" />}
                        <span className="flex-1 leading-tight">{o.name.replace(/ \(free\)$/, "")}</span>
                        <span className={`text-xs font-semibold ${on ? "text-ember" : "text-[#9a8d80]"}`}>{o.priceDeltaPaise > 0 ? `+${formatINR(o.priceDeltaPaise)}` : "Free"}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {g.options.map((o) => {
                    const on = optionIds.includes(o.id);
                    const art = optionArt(o.name);
                    return (
                      <button key={o.id} type="button" aria-pressed={on} onClick={() => toggle(g, o.id)} className={`press flex h-[46px] items-center gap-2 rounded-full border-[1.5px] pl-1.5 pr-3.5 text-[13px] font-semibold ${on ? "border-ember bg-[#fff4ee]" : "border-ink/10 bg-white"}`}>
                        {art ? <Image src={art} alt="" width={34} height={34} className="h-[34px] w-[34px] object-contain" /> : <span className="w-2" />}
                        {o.name}
                        <span className={`font-bold ${on ? "text-ember" : "text-[#9a8d80]"}`}>{on ? "✓" : "+"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
          <label className="block">
            <span className="mb-2 block text-[13px] font-bold">Note for the kitchen</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 200))} rows={2} placeholder="Allergies, extra crispy, less oil…" className="w-full resize-none rounded-[18px] border-[1.5px] border-ink/10 bg-[#fbf8f4] px-3.5 py-3 text-sm outline-none focus:border-ember" />
          </label>
        </div>

        <div className="flex items-center gap-3 border-t border-ink/5 px-[22px] pb-[max(18px,env(safe-area-inset-bottom))] pt-3.5">
          <Qty value={qty} onChange={setQty} />
          <button type="button" onClick={() => onAdd({ itemId: item.id, qty, optionIds, notes: notes.trim() })} className="press flex h-14 flex-1 items-center justify-center rounded-full bg-ember text-[15px] font-bold text-white shadow-[0_12px_24px_rgba(228,87,46,0.35)]">
            Add to order · {formatINR(unit * qty)}
          </button>
        </div>
      </div>
    </div>
  );
};
