export type ModifierOption = {
  id: string;
  name: string;
  priceDeltaPaise: number;
  isDefault: boolean;
};

export type ModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
};

export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  pricePaise: number;
  imageUrl: string | null;
  prepTime: string | null;
  tags: string[];
  isAvailable: boolean;
  groups: ModifierGroup[];
};

export type Category = { id: string; slug: string; name: string };

export type Restaurant = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  hours: string | null;
  gstRateBp: number;
};

export type Menu = {
  restaurant: Restaurant;
  categories: Category[];
  items: MenuItem[];
};

export type CartLineInput = {
  itemId: string;
  qty: number;
  optionIds: string[];
  notes?: string;
};

export type OrderStatus = "placed" | "preparing" | "ready" | "served" | "cancelled";
