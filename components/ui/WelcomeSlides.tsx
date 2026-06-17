"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { clsx } from "@/lib/clsx";

// Cambia la versión para volver a mostrar la bienvenida tras un rediseño grande.
const SEEN_KEY = "trackapp_welcome_v1";

type Slide = { icon: IconName; title: string; text: string; color: string };

const SLIDES: Slide[] = [
  {
    icon: "truck",
    title: "Bienvenido a TrackApp",
    text: "Tu gestión y facturación de transporte, sin papeleo. Pensada para autónomos al volante.",
    color: "var(--amber)",
  },
  {
    icon: "truck",
    title: "Viajes y portes",
    text: "Registra cada viaje y los portes de tus clientes. La app calcula los km y tu rentabilidad (€/km).",
    color: "var(--blue)",
  },
  {
    icon: "doc",
    title: "Facturas en segundos",
    text: "Junta los portes de un cliente y emite una factura multiporte. Descárgala o mándala por WhatsApp.",
    color: "var(--amber)",
  },
  {
    icon: "image",
    title: "Gastos con una foto",
    text: "Escanea el ticket y la IA lo apunta solo. Verás tu margen real y el gasto por kilómetro.",
    color: "var(--red)",
  },
  {
    icon: "chart",
    title: "Listo para Hacienda",
    text: "IVA a liquidar (modelo 303) e IRPF (130) calculados por trimestre. Sabes cuánto apartar.",
    color: "var(--green)",
  },
  {
    icon: "check",
    title: "Sistema Veri*factu",
    text: "Cada factura lleva una huella SHA-256 encadenada y un QR: un registro inalterable conforme a Veri*factu. (En pruebas: aún no se envía a la AEAT.)",
    color: "var(--purple)",
  },
];

/** Carrusel de bienvenida que se muestra solo la primera vez (por dispositivo). */
export function WelcomeSlides() {
  const [show, setShow] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setShow(true);
    } catch {
      /* sin localStorage: no mostramos para no molestar en cada carga */
    }
  }, []);

  function close() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* noop */
    }
    setShow(false);
  }

  if (!show) return null;

  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: "var(--bg)" }} role="dialog" aria-modal="true">
      {/* Saltar */}
      <div className="flex justify-end px-5 pt-5">
        <button type="button" onClick={close} className="text-[13px] font-bold text-dim">
          Saltar
        </button>
      </div>

      {/* Contenido del slide */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <span
          className="mb-7 grid h-24 w-24 place-items-center rounded-[28px]"
          style={{ color: slide.color, background: `color-mix(in srgb, ${slide.color} 16%, transparent)` }}
        >
          <Icon name={slide.icon} size={48} />
        </span>
        <h2 className="font-display text-[26px] font-bold leading-tight">{slide.title}</h2>
        <p className="mx-auto mt-3 max-w-[320px] text-[15px] leading-relaxed text-dim">{slide.text}</p>
      </div>

      {/* Puntos de progreso */}
      <div className="flex justify-center gap-2 pb-5">
        {SLIDES.map((_, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Ir al paso ${idx + 1}`}
            onClick={() => setI(idx)}
            className={clsx(
              "h-2 rounded-full transition-all",
              idx === i ? "w-6 bg-amber" : "w-2 bg-line",
            )}
          />
        ))}
      </div>

      {/* Navegación */}
      <div className="flex items-center gap-3 px-6 pb-9">
        {i > 0 ? (
          <button
            type="button"
            onClick={() => setI((n) => n - 1)}
            className="flex-none rounded-[18px] border border-line bg-panel px-5 py-4 text-sm font-bold text-text transition-transform active:scale-[0.97]"
          >
            Atrás
          </button>
        ) : (
          <div className="flex-none" />
        )}
        <button
          type="button"
          onClick={() => (last ? close() : setI((n) => n + 1))}
          className="flex-1 rounded-[18px] bg-amber py-4 text-[16px] font-extrabold text-[#1a1205] transition-transform active:scale-[0.97]"
        >
          {last ? "Empezar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
