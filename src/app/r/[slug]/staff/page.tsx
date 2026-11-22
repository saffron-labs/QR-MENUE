import { notFound } from "next/navigation";
import { AttendantBoard } from "@/components/staff/AttendantBoard";
import { getRestaurantBySlug } from "@/lib/menu";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendant", robots: { index: false, follow: false } };

export default async function StaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();
  return <AttendantBoard slug={slug} restaurantName={restaurant.name} />;
}
