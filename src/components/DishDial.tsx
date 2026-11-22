"use client";

import { useEffect, useRef, useState } from "react";
import type { MenuItem } from "@/lib/types";
import { DishArt } from "./ui";

type Props = { items: MenuItem[]; activeId: string; onChange: (id: string) => void };

const STEP_DEG = 40;
const SNAP_MS = 480;

/** Rotary-dial dish picker: plates ride a big circle; dragging up/down spins the wheel one dish at a time. */
export const DishDial = ({ items, activeId, onChange }: Props) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const activeIndex = Math.max(0, items.findIndex((i) => i.id === activeId));
  const [dragPos, setDragPos] = useState<number | null>(null);
  const dragging = dragPos !== null;
  const pos = dragPos ?? activeIndex;
  const drag = useRef({ y: 0, start: 0, lastY: 0, lastT: 0, v: 0 });
  const last = items.length - 1;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const D = Math.min(box.h, 420);
  const R = D * 1.3;
  const homeX = box.w * 0.3 + D / 2;
  const cx = homeX + R;
  const cy = box.h / 2;
  const stepPx = R * Math.sin((STEP_DEG * Math.PI) / 180);

  const clamp = (v: number) => Math.min(last + 0.35, Math.max(-0.35, v));

  const onDown = (e: React.PointerEvent) => {
    if (items.length < 2) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, start: pos, lastY: e.clientY, lastT: performance.now(), v: 0 };
    setDragPos(pos);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(1, now - drag.current.lastT);
    drag.current.v = (drag.current.lastY - e.clientY) / dt; // px/ms, positive = finger moving up
    drag.current.lastY = e.clientY;
    drag.current.lastT = now;
    setDragPos(clamp(drag.current.start + (drag.current.y - e.clientY) / stepPx));
  };
  const onUp = () => {
    if (!dragging) return;
    const flick = Math.abs(drag.current.v) > 0.35 ? Math.sign(drag.current.v) * 0.6 : 0;
    const target = Math.min(last, Math.max(0, Math.round(pos + flick)));
    setDragPos(null);
    const next = items[target];
    if (next && next.id !== activeId) onChange(next.id);
  };

  const ready = box.w > 0 && D > 0;

  return (
    <div
      ref={stageRef}
      className="absolute inset-0 touch-none overflow-hidden"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="group"
      aria-roledescription="dial"
      aria-label="Swipe up or down to spin through dishes"
    >
      {ready && (
        <>
          <span
            aria-hidden="true"
            className="absolute rounded-full border-[1.5px] border-dashed border-ember/30"
            style={{ width: R * 2, height: R * 2, left: cx - R, top: cy - R }}
          />
          <span aria-hidden="true" className="absolute rounded-full bg-peach" style={{ width: D * 0.94, height: D * 0.94, left: homeX - D * 0.47, top: cy - D * 0.47 }} />
          {items.map((it, i) => {
            const k = i - pos;
            if (Math.abs(k) > 2.2) return null;
            const th = (k * STEP_DEG * Math.PI) / 180;
            const x = cx - R * Math.cos(th);
            const y = cy + R * Math.sin(th);
            const a = Math.abs(k);
            const scale = Math.max(0.45, 1 - 0.3 * Math.min(a, 1.5));
            const opacity = Math.max(0, 1 - 0.45 * a);
            return (
              <div
                key={it.id}
                aria-hidden={i !== activeIndex}
                className="pointer-events-none absolute left-0 top-0"
                style={{
                  width: D,
                  height: D,
                  zIndex: 10 - Math.round(a * 3),
                  opacity,
                  transform: `translate(${x - D / 2}px, ${y - D / 2}px) rotate(${k * -STEP_DEG * 0.9}deg) scale(${scale})`,
                  transition: dragging ? "none" : `transform ${SNAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${SNAP_MS}ms ease`,
                  filter: "drop-shadow(0 30px 34px rgba(90,40,10,0.30))",
                  willChange: "transform",
                }}
              >
                <DishArt item={it} priority={a < 1} sizes="(max-width: 480px) 92vw, 420px" />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
