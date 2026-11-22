"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type CartLine, defaultOptionIds, sameLine } from "@/lib/cart";
import { getSupabase } from "@/lib/supabase";
import { JoinScreen } from "./session/JoinScreen";
import { PartyScreen } from "./session/PartyScreen";
import { TableScreen } from "./session/TableScreen";
import { useTableSession } from "./session/useTableSession";
import type { Menu } from "@/lib/types";
import { CartScreen } from "./CartScreen";
import { CustomizeScreen } from "./CustomizeScreen";
import { MenuScreen } from "./MenuScreen";

type View = "menu" | "customize" | "cart" | "table";
type Props = { menu: Menu; token: string; tableLabel: string };

export const OrderApp = ({ menu, token, tableLabel }: Props) => {
  const storageKey = `chackos:${menu.restaurant.slug}:${token}`;
  const itemsById = useMemo(() => new Map(menu.items.map((i) => [i.id, i])), [menu.items]);

  const firstCategory = menu.categories.find((c) => menu.items.some((i) => i.categoryId === c.id)) ?? menu.categories[0];
  const [view, setView] = useState<View>("menu");
  const [categoryId, setCategoryId] = useState(firstCategory?.id ?? "");
  const itemsInCategory = useMemo(() => menu.items.filter((i) => i.categoryId === categoryId), [menu.items, categoryId]);
  const [itemId, setItemId] = useState(itemsInCategory[0]?.id ?? "");
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [cart, setCart] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const session = useTableSession(menu.restaurant.slug, token);

  // Restore the cart and the active order after a refresh (browser storage only exists after hydration).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as { cart?: CartLine[] };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCart((saved.cart ?? []).filter((l) => itemsById.get(l.itemId)?.isAvailable));
    } catch {
      /* private mode or a corrupt value: start fresh */
    }
    setReady(true);
  }, [storageKey, itemsById]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ cart }));
    } catch {
      /* storage unavailable: the cart will not survive a refresh */
    }
  }, [cart, ready, storageKey]);

  const item = itemsById.get(itemId) ?? itemsInCategory[0];
  const cartCount = cart.reduce((n, l) => n + l.qty, 0);

  const selectCategory = (id: string) => {
    setCategoryId(id);
    setItemId(menu.items.find((i) => i.categoryId === id)?.id ?? "");
  };

  const addLine = useCallback((input: { itemId: string; qty: number; optionIds: string[]; notes: string }) => {
    setCart((prev) => {
      const existing = prev.find((l) => sameLine(l, input));
      if (existing) return prev.map((l) => (l === existing ? { ...l, qty: Math.min(20, l.qty + input.qty) } : l));
      return [...prev, { ...input, key: crypto.randomUUID() }];
    });
  }, []);

  const changeQty = (key: string, qty: number) =>
    setCart((prev) => (qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty: Math.min(20, qty) } : l))));

  const placeOrder = async (notes: string): Promise<string | null> => {
    const c = session.creds;
    if (!c) return "Your table session was not found. Please scan the QR code again.";
    const { data, error } = await getSupabase().rpc("place_order_session", {
      p_slug: menu.restaurant.slug,
      p_token: token,
      p_session: c.sessionId,
      p_guest: c.guestId,
      p_secret: c.secret,
      p_notes: notes || null,
      p_lines: cart.map(({ itemId: id, qty, optionIds, notes: n }) => ({ itemId: id, qty, optionIds, notes: n })),
    });
    const result = data as { orderId?: string } | null;
    if (error || !result?.orderId) return error?.message ?? "Something went wrong. Please try again.";
    setCart([]);
    await session.refresh();
    setView("table");
    return null;
  };

  if (session.stage === "loading") {
    return <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6 text-center text-muted">{session.offline ? "Can’t reach the server. Check your connection and refresh." : "Opening your table…"}</main>;
  }
  if (session.stage === "party") {
    return <PartyScreen restaurantName={menu.restaurant.name} tableLabel={tableLabel} onCreate={session.create} />;
  }
  if (session.stage === "join") {
    return <JoinScreen restaurantName={menu.restaurant.name} tableLabel={tableLabel} onJoin={session.join} />;
  }
  if (session.stage === "closed") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-display text-3xl font-extrabold">Thanks for dining with us</p>
        <p className="text-sm text-muted">This table has been closed. See you again soon.</p>
        <button type="button" onClick={session.startAgain} className="press h-12 rounded-full bg-ink px-6 text-sm font-bold text-white">Start a new table</button>
      </main>
    );
  }
  if (!item) {
    return <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6 text-center text-muted">The menu is being updated. Please check back shortly.</main>;
  }

  const toggleFav = () =>
    setFavs((prev) => {
      const next = new Set(prev);
      if (!next.delete(item.id)) next.add(item.id);
      return next;
    });

  if (view === "customize") {
    return (
      <CustomizeScreen
        key={item.id}
        item={item}
        fav={favs.has(item.id)}
        onFav={toggleFav}
        onBack={() => setView("menu")}
        onAdd={(line) => {
          addLine(line);
          setView("menu");
        }}
      />
    );
  }
  if (view === "cart") {
    return <CartScreen lines={cart} itemsById={itemsById} gstRateBp={menu.restaurant.gstRateBp} tableLabel={tableLabel} guestName={session.view?.me.name ?? ""} onBack={() => setView("menu")} onQty={changeQty} onPlace={placeOrder} />;
  }
  if (view === "table" && session.view && session.creds) {
    return <TableScreen view={session.view} creds={session.creds} onBack={() => setView("menu")} onRefresh={session.refresh} />;
  }

  return (
    <MenuScreen
      categories={menu.categories.filter((c) => menu.items.some((i) => i.categoryId === c.id))}
      categoryId={categoryId}
      onCategory={selectCategory}
      items={itemsInCategory}
      item={item}
      onItem={setItemId}
      tableLabel={tableLabel}
      cartCount={cartCount}
      fav={favs.has(item.id)}
      onFav={toggleFav}
      onCustomize={() => setView("customize")}
      onQuickAdd={() => addLine({ itemId: item.id, qty: 1, optionIds: defaultOptionIds(item), notes: "" })}
      onCart={() => setView("cart")}
      onStatus={() => setView("table")}
      hasOrder={Boolean(session.view?.orders.length)}
    />
  );
};
