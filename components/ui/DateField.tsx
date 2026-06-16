"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dateES, dmyToISO } from "@/lib/format";
import { Icon } from "./Icon";
import { clsx } from "@/lib/clsx";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const DIAS = ["L", "M", "X", "J", "V", "S", "D"]; // semana empezando en lunes

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Campo de fecha SIEMPRE en DD/MM/AAAA, con un calendario propio EN ESPAÑOL
 * (el selector nativo seguía el idioma del navegador y salía en inglés). El
 * calendario se monta en un PORTAL sobre <body> para que ningún campo del
 * formulario lo tape (la animación `stagger` crea contextos de apilamiento que
 * atraparían un popup normal). Envía al formulario un <input name> oculto en ISO.
 */
export function DateField({
  id,
  name,
  defaultISO = "",
}: {
  id: string;
  name: string;
  defaultISO?: string;
}) {
  const [display, setDisplay] = useState(defaultISO ? dateES(defaultISO) : "");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const iso = dmyToISO(display); // "" si la fecha está incompleta o no es válida

  const initial = iso ? new Date(iso) : new Date();
  const [viewY, setViewY] = useState(initial.getFullYear());
  const [viewM, setViewM] = useState(initial.getMonth());
  const boxRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera (contemplando que el popup vive en otro sitio del DOM).
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false); // evita que el popup quede descolocado al hacer scroll
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  function onType(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setDisplay(out);
  }

  function toggleCalendar() {
    if (open) {
      setOpen(false);
      return;
    }
    const base = iso ? new Date(iso) : new Date();
    setViewY(base.getFullYear());
    setViewM(base.getMonth());
    if (boxRef.current) {
      const r = boxRef.current.getBoundingClientRect();
      const width = 268;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 4, left });
    }
    setOpen(true);
  }

  function pick(day: number) {
    setDisplay(`${pad(day)}/${pad(viewM + 1)}/${viewY}`);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    let m = viewM + delta;
    let y = viewY;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    setViewM(m);
    setViewY(y);
  }

  const firstDow = (new Date(viewY, viewM, 1).getDay() + 6) % 7; // 0=lunes
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/AAAA"
        value={display}
        onChange={(e) => onType(e.target.value)}
        className="pr-12"
      />
      {/* Valor real enviado al formulario, en ISO. */}
      <input type="hidden" name={name} value={iso} />
      <button
        type="button"
        onClick={toggleCalendar}
        aria-label="Abrir calendario"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dim transition-colors hover:text-amber"
      >
        <Icon name="calendar" size={18} />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 268 }}
            className="z-[9999] rounded-2xl border border-line bg-panel p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Mes anterior"
                className="rounded-lg px-2 py-1 text-dim hover:bg-amber-soft hover:text-amber"
              >
                ‹
              </button>
              <span className="text-[13.5px] font-bold capitalize">
                {MESES[viewM]} {viewY}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Mes siguiente"
                className="rounded-lg px-2 py-1 text-dim hover:bg-amber-soft hover:text-amber"
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-bold text-dim">
              {DIAS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, i) => {
                if (day === null) return <div key={`b${i}`} />;
                const cellISO = `${viewY}-${pad(viewM + 1)}-${pad(day)}`;
                const selected = cellISO === iso;
                const isToday = cellISO === todayISO;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => pick(day)}
                    className={clsx(
                      "aspect-square rounded-lg text-[13px] font-medium transition-colors",
                      selected
                        ? "bg-amber font-bold text-[#1a1205]"
                        : isToday
                          ? "border border-amber-line text-amber hover:bg-amber-soft"
                          : "hover:bg-amber-soft",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
