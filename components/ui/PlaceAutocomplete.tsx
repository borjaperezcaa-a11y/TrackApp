"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ResolvedPlace = { lat: number; lon: number } | null;
type Place = { label: string; lon: number; lat: number };

/**
 * Input de origen/destino con autocompletado de lugares vía /api/places.
 * - Controlado: el texto lo gobierna el formulario padre (value + onChange) y un
 *   <input name> normal lo envía a la server action.
 * - Al elegir una sugerencia informa de las coordenadas con onResolve (para
 *   calcular los km). Al teclear a mano, onResolve(null): sin coordenadas.
 * - El desplegable se monta en un PORTAL sobre <body> para que ningún campo del
 *   formulario lo tape (la animación `stagger` crea contextos de apilamiento).
 * - Si `enabled` es false (sin clave de routing), es un input de texto normal.
 */
export function PlaceAutocomplete({
  id,
  name,
  value,
  onChange,
  onResolve,
  placeholder,
  enabled,
  required,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (text: string) => void;
  onResolve: (c: ResolvedPlace) => void;
  placeholder?: string;
  enabled: boolean;
  required?: boolean;
}) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  function reposition() {
    if (!boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  // Cerrar / reposicionar (el popup vive en otro punto del DOM por el portal).
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      reposition(); // sigue al campo (no cierra) al hacer scroll / abrir teclado
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

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, []);

  function handleType(text: string) {
    onChange(text);
    onResolve(null); // el texto cambió: ya no sabemos las coordenadas
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 3) {
      setPlaces([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => void search(text), 350); // debounce
  }

  async function search(text: string) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoading(true);
    reposition();
    setOpen(true);
    try {
      const res = await fetch(`/api/places?text=${encodeURIComponent(text)}`, { signal: ctrl.signal });
      if (!res.ok) {
        setPlaces([]);
        return;
      }
      const data = (await res.json()) as { places?: Place[] };
      setPlaces(data.places ?? []);
    } catch {
      setPlaces([]); // abortado o error de red: se sigue pudiendo escribir a mano
    } finally {
      setLoading(false);
    }
  }

  function select(p: Place) {
    onChange(p.label);
    onResolve({ lat: p.lat, lon: p.lon });
    setPlaces([]);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => handleType(e.target.value)}
        onFocus={() => {
          if (places.length > 0) {
            reposition();
            setOpen(true);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
      />
      {enabled &&
        open &&
        pos &&
        (loading || places.length > 0) &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={popRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-[9999] max-h-64 overflow-auto rounded-xl border border-line bg-panel shadow-xl"
          >
            {loading && places.length === 0 && (
              <li className="px-3 py-2.5 text-[13px] text-dim">Buscando…</li>
            )}
            {places.map((p, i) => (
              <li key={`${p.lat},${p.lon},${i}`} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => select(p)}
                  className="block w-full px-3 py-2.5 text-left text-[13px] font-medium hover:bg-amber-soft"
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
