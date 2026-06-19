"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

type Plantilla = "trackapp" | "elegante" | "moderna";
const STYLES: { id: Plantilla; label: string }[] = [
  { id: "trackapp", label: "TrackApp" },
  { id: "elegante", label: "Clásica" },
  { id: "moderna", label: "Moderna" },
];

/**
 * Comparador de estilos de factura: un carrusel deslizable con la imagen real de
 * cada plantilla (TrackApp, Clásica, Moderna), renderizada al vuelo en el cliente.
 * Marca el estilo activo. No descarga nada.
 */
export function StylePreview({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  current?: Plantilla;
}) {
  const [imgs, setImgs] = useState<Partial<Record<Plantilla, string>>>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(false);
    setImgs({});
    (async () => {
      try {
        const { renderStylePreview } = await import("@/lib/pdf/invoice-html");
        for (const s of STYLES) {
          const url = await renderStylePreview(s.id);
          if (!alive) return;
          setImgs((m) => ({ ...m, [s.id]: url }));
        }
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/70"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Estilos de factura"
    >
      <div
        className="max-h-[88dvh] overflow-hidden rounded-t-[24px] border-t border-line bg-panel pb-[max(16px,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <div className="text-[15px] font-bold">Estilos de factura</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-8 w-8 place-items-center rounded-full border border-line text-dim"
          >
            ✕
          </button>
        </div>
        <p className="px-4 pt-1 text-[12px] text-dim">Desliza para comparar. El estilo activo está marcado.</p>

        {error ? (
          <p className="m-4 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
            No se pudo generar la vista previa.
          </p>
        ) : (
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-3">
            {STYLES.map((s) => (
              <figure key={s.id} className="w-[78%] flex-none snap-center sm:w-[55%]">
                <figcaption className="mb-1.5 flex items-center justify-center gap-2 text-[13px] font-bold">
                  {s.label}
                  {current === s.id && (
                    <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-bold text-amber">
                      Activo
                    </span>
                  )}
                </figcaption>
                <div className="grid aspect-[210/297] place-items-center overflow-hidden rounded-xl border border-line bg-white">
                  {imgs[s.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgs[s.id]} alt={`Factura ${s.label}`} className="h-full w-full object-contain" />
                  ) : (
                    <span className="inline-flex items-center gap-2 text-[12px] text-dim">
                      <Icon name="doc" size={16} /> Generando…
                    </span>
                  )}
                </div>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
