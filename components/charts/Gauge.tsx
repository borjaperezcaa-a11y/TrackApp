"use client";

import { useEffect, useState } from "react";
import { intES } from "@/lib/format";

/**
 * Medidor semicircular de beneficio (estilo cuadro de mandos del mockup).
 * La aguja/arco se llena según value/max; el número cuenta hacia arriba.
 * Accesible: role=img + aria-label con el dato en texto; respeta reduce-motion.
 */
export function Gauge({
  value,
  max,
  label,
  unit = "€",
}: {
  value: number;
  max: number;
  label: string;
  unit?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const positive = value >= 0;
  const color = positive ? "var(--green)" : "var(--red)";

  const [arc, setArc] = useState(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setArc(pct);
      setDisplay(value);
      return;
    }
    const raf1 = requestAnimationFrame(() => setArc(pct));
    const dur = 950;
    const start = performance.now();
    let raf2 = 0;
    const step = (t: number) => {
      let p = Math.min(1, (t - start) / dur);
      p = 1 - Math.pow(1 - p, 3);
      setDisplay(value * p);
      if (p < 1) raf2 = requestAnimationFrame(step);
    };
    raf2 = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [value, pct]);

  const aria =
    `${label}: ${intES(value)} ${unit}` +
    (max > 0 ? `, ${Math.round(pct * 100)}% del mejor mes` : "");

  return (
    <div
      className="relative mx-auto"
      style={{ width: 236, height: 124 }}
      role="img"
      aria-label={aria}
    >
      <svg viewBox="0 0 200 116" className="h-full w-full overflow-visible" aria-hidden="true">
        <path
          d="M14,104 A86,86 0 0 1 186,104"
          fill="none"
          stroke="var(--panel2)"
          strokeWidth={15}
          strokeLinecap="round"
          pathLength={100}
        />
        <path
          d="M14,104 A86,86 0 0 1 186,104"
          fill="none"
          stroke={color}
          strokeWidth={15}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${arc * 100} 100`}
          style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.33,1,.68,1)" }}
        />
      </svg>
      <div
        className="absolute bottom-1 left-0 right-0 text-center font-display font-bold leading-none tnum"
        style={{ fontSize: 54, color }}
        aria-hidden="true"
      >
        {intES(Math.round(display))}
        <small className="ml-0.5 align-top" style={{ fontSize: 24 }}>
          {unit}
        </small>
      </div>
    </div>
  );
}
