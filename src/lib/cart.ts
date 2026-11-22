import type { MenuItem } from "./types";

export type CartLine = { key: string; itemId: string; qty: number; optionIds: string[]; notes: string };

export const defaultOptionIds = (item: MenuItem): string[] =>
  item.groups.flatMap((g) => (g.minSelect > 0 ? g.options.filter((o) => o.isDefault).slice(0, g.maxSelect).map((o) => o.id) : []));

export const lineUnitPaise = (item: MenuItem, optionIds: string[]): number =>
  item.pricePaise +
  item.groups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id)).reduce((sum, o) => sum + o.priceDeltaPaise, 0);

export const optionSummary = (item: MenuItem, optionIds: string[]): string =>
  item.groups
    .flatMap((g) => g.options)
    .filter((o) => optionIds.includes(o.id))
    .map((o) => o.name.replace(/ \(free\)$/, ""))
    .join(" · ");

export const sameLine = (a: Pick<CartLine, "itemId" | "optionIds" | "notes">, b: Pick<CartLine, "itemId" | "optionIds" | "notes">) =>
  a.itemId === b.itemId && a.notes === b.notes && [...a.optionIds].sort().join() === [...b.optionIds].sort().join();

/** Photo for an option (bread and dips), matched by name. */
export const optionArt = (name: string): string | null => {
  const n = name.toLowerCase();
  if (n.includes("porotta")) return "/menu/porotta.webp";
  if (n.includes("rumali")) return "/menu/rumali.webp";
  if (n.includes("mayo")) return "/menu/mayo.webp";
  if (n.includes("tomato") || n.includes("sahawiq")) return "/menu/chutney.webp";
  if (n.includes("mint")) return "/menu/mint.webp";
  return null;
};
