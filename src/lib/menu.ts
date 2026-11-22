import "server-only";
import { getSupabase } from "./supabase";
import type { Category, Menu, MenuItem, Restaurant } from "./types";

type Row = Record<string, unknown>;

export const getRestaurantBySlug = async (slug: string): Promise<Restaurant | null> => {
  const { data, error } = await getSupabase()
    .from("restaurants")
    .select("id, slug, name, tagline, address, phone, hours, gst_rate_bp")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    tagline: data.tagline,
    address: data.address,
    phone: data.phone,
    hours: data.hours,
    gstRateBp: data.gst_rate_bp,
  };
};

export const getMenu = async (restaurant: Restaurant): Promise<Menu> => {
  const db = getSupabase();
  const [cats, items] = await Promise.all([
    db.from("categories").select("id, slug, name").eq("restaurant_id", restaurant.id).order("sort_order"),
    db
      .from("menu_items")
      .select(
        "id, category_id, name, description, price_paise, image_url, prep_time, tags, is_available, sort_order, modifier_groups(id, name, min_select, max_select, sort_order, modifier_options(id, name, price_delta_paise, is_default, sort_order))",
      )
      .eq("restaurant_id", restaurant.id)
      .order("sort_order"),
  ]);
  if (cats.error) throw cats.error;
  if (items.error) throw items.error;

  const bySort = (a: Row, b: Row) => Number(a.sort_order) - Number(b.sort_order);

  const categories: Category[] = cats.data.map((c) => ({ id: c.id, slug: c.slug, name: c.name }));
  const menuItems: MenuItem[] = items.data.map((i) => ({
    id: i.id,
    categoryId: i.category_id,
    name: i.name,
    description: i.description ?? "",
    pricePaise: i.price_paise,
    imageUrl: i.image_url,
    prepTime: i.prep_time,
    tags: i.tags ?? [],
    isAvailable: i.is_available,
    groups: [...(i.modifier_groups ?? [])].sort(bySort).map((g) => ({
      id: g.id,
      name: g.name,
      minSelect: g.min_select,
      maxSelect: g.max_select,
      options: [...(g.modifier_options ?? [])].sort(bySort).map((o) => ({
        id: o.id,
        name: o.name,
        priceDeltaPaise: o.price_delta_paise,
        isDefault: o.is_default,
      })),
    })),
  }));

  return { restaurant, categories, items: menuItems };
};

export const getTableByToken = async (restaurant: Restaurant, token: string) => {
  const { data, error } = await getSupabase().rpc("get_table", { p_slug: restaurant.slug, p_token: token });
  if (error) throw error;
  return data ? { label: (data as { label: string }).label } : null;
};
