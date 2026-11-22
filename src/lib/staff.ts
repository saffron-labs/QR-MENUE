import { getSupabase } from "./supabase";
import type { OrderStatus } from "./types";

export type StaffRole = "kitchen" | "attendant";
export type StaffOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  table: string;
  customer: string | null;
  guests: number | null;
  notes: string | null;
  totalPaise: number;
  createdAt: string;
  updatedAt: string;
  items: { name: string; qty: number; notes: string | null; modifiers: { group: string; option: string }[] }[];
};
export type StaffBoard = { now: string; tables: { id: string; label: string }[]; orders: StaffOrder[] };
export type StaffMenuItem = { id: string; name: string; category: string; available: boolean };

type Rpc<T> = T | { error: string };
const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  const res = data as Rpc<T>;
  if (res && typeof res === "object" && "error" in res) throw new Error((res as { error: string }).error);
  return res as T;
};

export const fetchBoard = (slug: string, pin: string, role: StaffRole) => call<StaffBoard>("staff_board", { p_slug: slug, p_pin: pin, p_role: role });
export const setOrderStatus = (slug: string, pin: string, role: StaffRole, orderId: string, status: OrderStatus) =>
  call<{ ok: true }>("staff_set_status", { p_slug: slug, p_pin: pin, p_role: role, p_order_id: orderId, p_status: status });
export const fetchStaffMenu = (slug: string, pin: string, role: StaffRole) =>
  call<{ items: StaffMenuItem[] }>("staff_menu", { p_slug: slug, p_pin: pin, p_role: role });
export const setAvailable = (slug: string, pin: string, role: StaffRole, itemId: string, available: boolean) =>
  call<{ ok: true }>("staff_set_available", { p_slug: slug, p_pin: pin, p_role: role, p_item_id: itemId, p_available: available });
