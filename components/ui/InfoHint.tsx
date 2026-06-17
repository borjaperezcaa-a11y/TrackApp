"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "@/lib/clsx";
import { Icon } from "./Icon";

/**
 * Iconito ⓘ que, al tocarlo, abre una hoja inferior (bottom sheet) con una
 * explicación en lenguaje llano. Pensado para acompañar a cada KPI/tarjeta.
 * Cierra con la "X"/botón, tocando fuera o con Escape.
 */
export function InfoHint({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Qué es ${title}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="-mr-1 -mt-0.5 shrink-0 rounded-full p-1 text-dim/60 transition-colors active:text-amber"
      >
        <Icon name="info" size={15} />
      </button>
      {open && <Sheet title={title} onClose={() => setOpen(false)} children={children} />}
    </>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Animación de entrada (el siguiente frame para que la transición corra).
    const id = requestAnimationFrame(() => setShow(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div
        onClick={onClose}
        className={clsx("absolute inset-0 bg-black/50 transition-opacity duration-200", show ? "opacity-100" : "opacity-0")}
      />
      <div
        className={clsx(
          "relative w-full max-w-[480px] rounded-t-[26px] border-t border-line bg-panel px-5 pb-9 pt-3 shadow-[var(--shadow)] transition-transform duration-200 ease-out",
          show ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <h3 className="font-display text-[19px] font-bold leading-tight">{title}</h3>
        <p className="mt-2 text-[14.5px] leading-relaxed text-dim">{children}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-[18px] bg-amber py-3.5 text-sm font-extrabold text-[#1a1205] transition-transform active:scale-[0.98]"
        >
          Entendido
        </button>
      </div>
    </div>,
    document.body,
  );
}
