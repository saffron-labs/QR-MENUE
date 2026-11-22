import { getSupabase } from "./supabase";
import type { OrderStatus } from "./types";

export type Credentials = { sessionId: string; guestId: string; secret: string; code: string };
export type TableState = { label: string; inUse: boolean; guests: number };
export type SessionOrder = {
  id: string; number: number; status: OrderStatus; guestId: string | null; createdAt: string;
  subtotalPaise: number; taxPaise: number; totalPaise: number;
  items: { name: string; qty: number; unitPaise: number }[];
};
export type SessionView = {
  tableLabel: string; code: string; partySize: number; openedAt: string;
  billRequested: boolean; billReady: boolean; billNumber: number | null;
  me: { id: string; name: string };
  restaurant: { name: string; address: string | null; gstRateBp: number };
  guests: { id: string; name: string }[];
  orders: SessionOrder[];
};
export type SessionResult = { view: SessionView } | { closed: true } | { gone: true };

type Joined = Credentials | { error: string };

const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const credsKey = (slug: string, token: string) => `chackos:${slug}:${token}:session`;
export const loadCreds = (slug: string, token: string): Credentials | null => {
  try {
    const raw = localStorage.getItem(credsKey(slug, token));
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
};
export const saveCreds = (slug: string, token: string, c: Credentials | null) => {
  try {
    if (c) localStorage.setItem(credsKey(slug, token), JSON.stringify(c));
    else localStorage.removeItem(credsKey(slug, token));
  } catch {
    /* storage unavailable: the guest will need to re-join after a refresh */
  }
};

export const tableState = (slug: string, token: string) => rpc<TableState | null>("table_state", { p_slug: slug, p_token: token });
export const startSession = (slug: string, token: string, party: number, name: string) =>
  rpc<Joined>("start_session", { p_slug: slug, p_token: token, p_party: party, p_name: name });
export const joinSession = (slug: string, token: string, code: string, name: string) =>
  rpc<Joined>("join_session", { p_slug: slug, p_token: token, p_code: code, p_name: name });

export const getSession = async (slug: string, token: string, c: Credentials): Promise<SessionResult> => {
  const data = await rpc<(SessionView & { closed?: boolean; error?: string }) | null>("get_session", {
    p_slug: slug, p_token: token, p_session: c.sessionId, p_guest: c.guestId, p_secret: c.secret,
  });
  if (!data || data.error) return { gone: true };
  if (data.closed) return { closed: true };
  return { view: data };
};

export const requestBill = (c: Credentials) => rpc<{ ok: true }>("request_bill", { p_session: c.sessionId, p_guest: c.guestId, p_secret: c.secret });
