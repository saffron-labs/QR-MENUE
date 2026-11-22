import type { CartLineInput, MenuItem } from "./types";

export type PricedLine = {
  item: MenuItem;
  qty: number;
  unitPaise: number;
  lineTotalPaise: number;
  chosen: { group: string; option: string; priceDeltaPaise: number }[];
  notes: string | null;
};

export type PricedOrder = {
  lines: PricedLine[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
};

export class OrderValidationError extends Error {}

const MAX_LINES = 40;

/**
 * Prices a cart from the server's own menu data. Nothing the client sends about
 * prices is trusted: only item ids, option ids and quantities are used.
 */
export const priceOrder = (
  menuById: Map<string, MenuItem>,
  lines: CartLineInput[],
  gstRateBp: number,
): PricedOrder => {
  if (lines.length === 0) throw new OrderValidationError("Your cart is empty.");
  if (lines.length > MAX_LINES) throw new OrderValidationError("Too many items in one order.");

  const priced = lines.map((line): PricedLine => {
    const item = menuById.get(line.itemId);
    if (!item) throw new OrderValidationError("An item in your cart no longer exists.");
    if (!item.isAvailable) throw new OrderValidationError(`${item.name} is sold out right now.`);
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 20) {
      throw new OrderValidationError(`Invalid quantity for ${item.name}.`);
    }

    const picked = new Set(line.optionIds);
    const chosen: PricedLine["chosen"] = [];
    let unitPaise = item.pricePaise;

    for (const group of item.groups) {
      const selected = group.options.filter((o) => picked.has(o.id));
      if (selected.length < group.minSelect || selected.length > group.maxSelect) {
        throw new OrderValidationError(`Please review "${group.name}" for ${item.name}.`);
      }
      for (const option of selected) {
        unitPaise += option.priceDeltaPaise;
        chosen.push({ group: group.name, option: option.name, priceDeltaPaise: option.priceDeltaPaise });
      }
      selected.forEach((o) => picked.delete(o.id));
    }
    if (picked.size > 0) throw new OrderValidationError(`Invalid options for ${item.name}.`);

    return {
      item,
      qty: line.qty,
      unitPaise,
      lineTotalPaise: unitPaise * line.qty,
      chosen,
      notes: line.notes?.trim() ? line.notes.trim().slice(0, 200) : null,
    };
  });

  const subtotalPaise = priced.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  const taxPaise = Math.round((subtotalPaise * gstRateBp) / 10000);
  return { lines: priced, subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
};
