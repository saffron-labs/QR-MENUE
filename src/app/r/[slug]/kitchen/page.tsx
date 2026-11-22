import { notFound } from "next/navigation";
import { KitchenBoard } from "@/components/staff/KitchenBoard";
import { getRestaurantBySlug } from "@/lib/menu";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kitchen", robots: { index: false, follow: false } };

export default async function KitchenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();
  return <KitchenBoard slug={slug} restaurantName={restaurant.name} />;
}
