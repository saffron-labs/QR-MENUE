import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderValidationError, priceOrder } from "../src/lib/pricing.ts";
import type { MenuItem } from "../src/lib/types.ts";

const item: MenuItem = {
  id: "i1",
  categoryId: "c1",
  name: "Alfaham Classic",
  description: "",
  pricePaise: 18000,
  imageUrl: null,
  prepTime: null,
  tags: [],
  isAvailable: true,
  groups: [
    {
      id: "g-bread",
      name: "Bread",
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: "rumali", name: "Rumali", priceDeltaPaise: 0, isDefault: true },
        { id: "porotta", name: "Porotta", priceDeltaPaise: 500, isDefault: false },
      ],
    },
    {
      id: "g-dips",
      name: "Dips",
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: "d1", name: "Mayo", priceDeltaPaise: 2000, isDefault: false },
        { id: "d2", name: "Chutney", priceDeltaPaise: 2000, isDefault: false },
        { id: "d3", name: "Mint", priceDeltaPaise: 2000, isDefault: false },
      ],
    },
  ],
};
const menu = new Map([[item.id, item]]);

test("prices base + modifiers server-side and adds GST", () => {
  const result = priceOrder(menu, [{ itemId: "i1", qty: 2, optionIds: ["porotta", "d1"] }], 500);
  assert.equal(result.lines[0]!.unitPaise, 18000 + 500 + 2000);
  assert.equal(result.subtotalPaise, 41000);
  assert.equal(result.taxPaise, 2050);
  assert.equal(result.totalPaise, 43050);
});

test("rejects missing required group", () => {
  assert.throws(() => priceOrder(menu, [{ itemId: "i1", qty: 1, optionIds: [] }], 500), OrderValidationError);
});

test("rejects too many options in a group", () => {
  assert.throws(
    () => priceOrder(menu, [{ itemId: "i1", qty: 1, optionIds: ["rumali", "d1", "d2", "d3"] }], 500),
    OrderValidationError,
  );
});

test("rejects option ids that do not belong to the item", () => {
  assert.throws(() => priceOrder(menu, [{ itemId: "i1", qty: 1, optionIds: ["rumali", "evil"] }], 500), OrderValidationError);
});

test("rejects unavailable items, bad quantities and empty carts", () => {
  const soldOut = new Map([[item.id, { ...item, isAvailable: false }]]);
  assert.throws(() => priceOrder(soldOut, [{ itemId: "i1", qty: 1, optionIds: ["rumali"] }], 500), OrderValidationError);
  assert.throws(() => priceOrder(menu, [{ itemId: "i1", qty: 0, optionIds: ["rumali"] }], 500), OrderValidationError);
  assert.throws(() => priceOrder(menu, [], 500), OrderValidationError);
});
