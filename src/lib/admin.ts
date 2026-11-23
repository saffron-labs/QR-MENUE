import { getSupabase } from "./supabase";
import type { OrderStatus } from "./types";

export type Overview = {
  totals: { orders: number; cancelled: number; revenuePaise: number; subtotalPaise: number; taxPaise: number; avgPaise: number; open: number };
  byDay: { day: string; orders: number; revenuePaise: number }[];
  byHour: { hour: number; orders: number }[];
  top: { name: string; qty: number; revenuePaise: number }[];
  byTable: { table: string; orders: number; revenuePaise: number }[];
};
export type FloorTable = { label: string; code: string | null; party: number | null; joined: number; totalPaise: number; state: "free" | "eating" | "bill" | "late"; quietMin: number | null };
export type Insights = {
  prev: { orders: number; revenuePaise: number; avgPaise: number; taxPaise: number };
  guests: number; prevGuests: number;
  avgTableMin: number | null; prevAvgTableMin: number | null;
  revByHour: number[]; prevRevByHour: number[]; prevByDay: number[];
  byCategory: { name: string; revenuePaise: number }[];
  pipeline: { placed: number; preparing: number; ready: number; servedOpen: number };
  late: { number: number; table: string; status: OrderStatus; minutes: number }[];
  unavailable: string[];
  floor: FloorTable[];
  recent: { number: number; status: OrderStatus; table: string; customer: string | null; guests: number | null; totalPaise: number; createdAt: string; items: string | null }[];
  timeline: { hour: number; orders: number; bills: number; late: number }[];
};
export type AdminOrder = {
  id: string; number: number; status: OrderStatus; table: string; customer: string | null; guests: number | null; notes: string | null;
  subtotalPaise: number; taxPaise: number; totalPaise: number; createdAt: string;
  items: { name: string; qty: number; unitPaise: number; notes: string | null; modifiers: { group: string; option: string }[] | null }[];
};
export type AdminItem = { id: string; categoryId: string; name: string; description: string | null; pricePaise: number; available: boolean; imageUrl: string | null };
export type AdminMenu = { categories: { id: string; name: string }[]; items: AdminItem[] };
export type AdminTable = { id: string; label: string; token: string };

const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  if (data && typeof data === "object" && "error" in data) throw new Error((data as { error: string }).error);
  return data as T;
};
const base = (slug: string, pin: string) => ({ p_slug: slug, p_pin: pin });

export const fetchOverview = (s: string, p: string, days: number) => call<Overview>("admin_overview", { ...base(s, p), p_days: days });
export const fetchInsights = (s: string, p: string, days: number) => call<Insights>("admin_insights", { ...base(s, p), p_days: days });
export const fetchAdminOrders = (s: string, p: string, days: number, status: string | null) =>
  call<{ orders: AdminOrder[] }>("admin_orders", { ...base(s, p), p_days: days, p_status: status });
export const fetchAdminMenu = (s: string, p: string) => call<AdminMenu>("admin_menu", base(s, p));
export const saveItem = (s: string, p: string, item: Partial<AdminItem> & { name: string; pricePaise: number; categoryId: string }) =>
  call<{ ok: true }>("admin_save_item", { ...base(s, p), p_item: item });
export const deleteItem = (s: string, p: string, id: string) => call<{ ok: true }>("admin_delete_item", { ...base(s, p), p_item_id: id });
export const fetchAdminTables = (s: string, p: string) => call<{ tables: AdminTable[] }>("admin_tables", base(s, p));
export const addTable = (s: string, p: string, label: string) => call<{ ok: true }>("admin_add_table", { ...base(s, p), p_label: label });
export const rotateToken = (s: string, p: string, id: string) => call<{ ok: true }>("admin_rotate_token", { ...base(s, p), p_table_id: id });
export const setStaffPin = (s: string, p: string, role: string, pin: string) =>
  call<{ ok: true }>("admin_set_pin", { ...base(s, p), p_role: role, p_new_pin: pin });

// ---------- inventory ----------
export type InvUnit = "kg" | "g" | "l" | "ml" | "pcs" | "pack";
export type InvStatus = "ok" | "low" | "out";
export type InvItem = {
  id: string; name: string; unit: InvUnit; category: string | null; qty: number; reorderLevel: number; costPaise: number; supplier: string | null;
  status: InvStatus; used7d: number; daysLeft: number | null; valuePaise: number; dishes: number;
};
export type InvDish = { id: string; name: string; categoryName: string; available: boolean; stockDisabled: boolean; recipe: { itemId: string; qty: number }[] };
export type InvMovement = { id: string; itemName: string; unit: InvUnit; delta: number; reason: "opening" | "purchase" | "sale" | "cancel" | "waste" | "adjust" | "count"; note: string | null; createdAt: string; orderNumber: number | null };
export type Inventory = { items: InvItem[]; dishes: InvDish[]; movements: InvMovement[]; wasteWeekPaise: number };
export type StockAlert = { name: string; unit: InvUnit; qty: number; reorderLevel: number; status: "low" | "out" };
export type StockMode = "purchase" | "waste" | "count" | "adjust";

export const fetchInventory = (slug: string, pin: string) => call<Inventory>("admin_inventory", base(slug, pin));
export const fetchStockAlerts = async (slug: string, pin: string) => (await call<{ items: StockAlert[] }>("admin_stock_alerts", base(slug, pin))).items;
export const saveInvItem = (slug: string, pin: string, item: { id?: string; name: string; unit: InvUnit; category: string; reorderLevel: number; costPaise: number; supplier: string; qty?: number }) =>
  call<{ id: string }>("admin_save_inv_item", { ...base(slug, pin), p_item: item });
export const deleteInvItem = (slug: string, pin: string, id: string) => call("admin_delete_inv_item", { ...base(slug, pin), p_item_id: id });
export const moveStock = (slug: string, pin: string, id: string, mode: StockMode, qty: number, note: string, costPaise: number | null) =>
  call("admin_stock_move", { ...base(slug, pin), p_item_id: id, p_mode: mode, p_qty: qty, p_note: note, p_cost_paise: costPaise });
export const saveRecipe = (slug: string, pin: string, menuItemId: string, lines: { itemId: string; qty: number }[]) =>
  call("admin_save_recipe", { ...base(slug, pin), p_menu_item_id: menuItemId, p_lines: lines });
export const inventoryQuickstart = (slug: string, pin: string) => call("admin_inv_quickstart", base(slug, pin));
