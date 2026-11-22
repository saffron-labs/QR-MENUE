"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type CartLine, defaultOptionIds, sameLine } from "@/lib/cart";
import { getSupabase } from "@/lib/supabase";
import type { Menu } from "@/lib/types";
import { CartScreen } from "./CartScreen";
import { CustomizeScreen } from "./CustomizeScreen";
import { MenuScreen } from "./MenuScreen";
import { StatusScreen } from "./StatusScreen";

type View = "menu" | "customize" | "cart" | "status";
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
  const [orderId, setOrderId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Restore the cart and the active order after a refresh (browser storage only exists after hydration).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as { cart?: CartLine[]; orderId?: string };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCart((saved.cart ?? []).filter((l) => itemsById.get(l.itemId)?.isAvailable));
      setOrderId(saved.orderId ?? null);
    } catch {
      /* private mode or a corrupt value: start fresh */
    }
    setReady(true);
  }, [storageKey, itemsById]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ cart, orderId }));
    } catch {
      /* storage unavailable: the cart will not survive a refresh */
    }
  }, [cart, orderId, ready, storageKey]);

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

  const placeOrder = async (details: { customerName: string; guestCount: number | undefined; notes: string }): Promise<string | null> => {
    const { data, error } = await getSupabase().rpc("place_order", {
      p_slug: menu.restaurant.slug,
      p_token: token,
      p_customer: details.customerName || null,
      p_guests: details.guestCount ?? null,
      p_notes: details.notes || null,
      p_lines: cart.map(({ itemId: id, qty, optionIds, notes }) => ({ itemId: id, qty, optionIds, notes })),
    });
    const result = data as { orderId?: string } | null;
    if (error || !result?.orderId) return error?.message ?? "Something went wrong. Please try again.";
    setOrderId(result.orderId);
    setCart([]);
    setView("status");
    return null;
  };

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
    return <CartScreen lines={cart} itemsById={itemsById} gstRateBp={menu.restaurant.gstRateBp} tableLabel={tableLabel} onBack={() => setView("menu")} onQty={changeQty} onPlace={placeOrder} />;
  }
  if (view === "status" && orderId) {
    return <StatusScreen orderId={orderId} onBack={() => setView("menu")} onNewOrder={() => setView("menu")} />;
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
      onStatus={() => setView(orderId ? "status" : "cart")}
      hasOrder={Boolean(orderId)}
    />
  );
};
