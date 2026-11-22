import { notFound } from "next/navigation";
import { OrderApp } from "@/components/OrderApp";
import { getMenu, getRestaurantBySlug, getTableByToken } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function TablePage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();
  const table = await getTableByToken(restaurant, token);
  if (!table) notFound();
  const menu = await getMenu(restaurant);
  return <OrderApp menu={menu} token={token} tableLabel={table.label} />;
}
