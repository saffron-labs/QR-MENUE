import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["600", "800"] });

export const metadata: Metadata = {
  title: "Chackos · Order at your table",
  description: "Scan, order and relax. Your food is on its way.",
};

export const viewport: Viewport = { themeColor: "#f4ede4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
