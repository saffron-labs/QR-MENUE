"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import type { MenuItem } from "@/lib/types";

export const shortName = (name: string) => name.replace(/\s*\(.*?\)\s*$/, "");

export const Icon = {
  back: <path d="M15 5l-7 7 7 7" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  home: <path d="M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-5H9v5H5a1 1 0 01-1-1z" />,
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1.2 11H6.2L5 8z" />
      <path d="M9 8V6.5a3 3 0 016 0V8" />
    </>
  ),
  plusCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
    </>
  ),
};

export const Svg = ({ children, size = 20, stroke = "currentColor", fill = "none", width = 2 }: { children: ReactNode; size?: number; stroke?: string; fill?: string; width?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

/** Dish photo on a transparent plate, or a plain plate when we have no photo yet. */
export const DishArt = ({ item, className = "", priority = false, sizes = "400px" }: { item: MenuItem; className?: string; priority?: boolean; sizes?: string }) =>
  item.imageUrl ? (
    <Image src={item.imageUrl} alt={shortName(item.name)} width={640} height={640} sizes={sizes} priority={priority} className={`h-full w-full object-contain ${className}`} />
  ) : (
    <span role="img" aria-label={`${shortName(item.name)}, photo coming soon`} className={`block h-[78%] w-[78%] rounded-full bg-[radial-gradient(circle_at_42%_38%,#f6e4c2,#d8af72_70%,#b98a4c)] ${className}`} />
  );

export const CircleButton = ({ label, onClick, children, dark = false }: { label: string; onClick?: () => void; children: ReactNode; dark?: boolean }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={`press relative flex h-12 w-12 items-center justify-center rounded-2xl border shadow-[0_6px_16px_rgba(80,40,10,0.08)] ${dark ? "rounded-full border-transparent bg-ink text-white" : "border-ink/10 bg-white"}`}
  >
    {children}
  </button>
);

export const Qty = ({ value, onChange, min = 1 }: { value: number; onChange: (n: number) => void; min?: number }) => (
  <div className="flex h-12 items-center rounded-full bg-cream px-1">
    <button type="button" aria-label="Decrease quantity" onClick={() => onChange(Math.max(min, value - 1))} className="press flex h-10 w-10 items-center justify-center rounded-full bg-white">
      <Svg size={16} width={2.6}>{Icon.minus}</Svg>
    </button>
    <span className="w-8 text-center text-[15px] font-bold tabular-nums" aria-live="polite">{value}</span>
    <button type="button" aria-label="Increase quantity" onClick={() => onChange(Math.min(20, value + 1))} className="press flex h-10 w-10 items-center justify-center rounded-full bg-white">
      <Svg size={16} width={2.6}>{Icon.plus}</Svg>
    </button>
  </div>
);
