"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { clsx } from "@/lib/clsx";

// Cambia la versión para volver a mostrar la bienvenida tras un rediseño grande.
const SEEN_KEY = "trackapp_welcome_v2";

// ── Marco "móvil" que envuelve cada mini-mockup ──────────────────────────────
function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-[212px] rounded-[32px] bg-panel2 p-2 shadow-[var(--shadow)]">
      <div className="relative h-[330px] overflow-hidden rounded-[24px] border border-line bg-panel">
        <div className="absolute left-1/2 top-2 h-1.5 w-12 -translate-x-1/2 rounded-full" style={{ background: "var(--line)" }} />
        <div className="h-full overflow-hidden px-3 pb-3 pt-7 text-left">{children}</div>
      </div>
    </div>
  );
}

function Chip({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold"
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {children}
    </span>
  );
}

function Bar({ label, h, color }: { label: string; h: number; color: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-end gap-1">
      <div className="w-full rounded-t-[4px]" style={{ height: h, background: color }} />
      <span className="text-[8px] text-dim">{label}</span>
    </div>
  );
}

// ── Mockups por slide ────────────────────────────────────────────────────────
function MockHome() {
  return (
    <div>
      <div className="text-[8px] font-bold uppercase tracking-wider text-dim">Buenos días</div>
      <div className="font-display text-[15px] font-bold leading-none">Tu negocio</div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {[
          { i: "image", c: "var(--red)", t: "Gasto" },
          { i: "truck", c: "var(--blue)", t: "Viaje" },
          { i: "income", c: "var(--green)", t: "Ingreso" },
        ].map((q) => (
          <div key={q.t} className="flex flex-col items-center gap-1 rounded-[12px] border border-line bg-panel2 py-2">
            <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ color: q.c, background: `color-mix(in srgb, ${q.c} 16%, transparent)` }}>
              <Icon name={q.i as "image"} size={13} />
            </span>
            <span className="text-[7.5px] font-bold">{q.t}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 rounded-[14px] border border-line bg-panel2 p-2.5">
        <div className="text-[8px] font-bold uppercase tracking-wide text-dim">Pendiente de cobro</div>
        <div className="font-display text-[18px] font-bold text-amber">1.417,00 €</div>
        <div className="text-[8px] text-dim">2 documentos sin cobrar</div>
      </div>
      <div className="mt-2.5 rounded-[14px] border border-line bg-panel2 p-2.5 text-center">
        <div className="text-[8px] font-bold uppercase tracking-wide text-dim">Beneficio del mes</div>
        <div className="font-display text-[16px] font-bold text-green">+ 9.724 €</div>
      </div>
    </div>
  );
}

function MockViaje() {
  return (
    <div>
      <div className="text-[8px] font-bold uppercase tracking-wider text-dim">Viaje</div>
      <div className="rounded-[14px] border border-line bg-panel2 p-2.5">
        <div className="font-display text-[13px] font-bold leading-tight">Santiago → Madrid</div>
        <div className="mt-0.5 text-[9px] text-dim">14/06/2026 · 600 km · 2 portes</div>
        <div className="mt-1"><Chip color="var(--green)">2,72 €/km</Chip></div>
      </div>
      <div className="mt-2 text-[8px] font-bold uppercase tracking-wide text-dim">Portes</div>
      {[
        { c: "Transportes García", r: "Santiago → Madrid", v: "1.300 €" },
        { c: "Frutas Pérez", r: "Lugo → Madrid", v: "900 €" },
      ].map((p) => (
        <div key={p.c} className="mt-1.5 flex items-center justify-between rounded-[12px] border border-line bg-panel2 px-2.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-[10px] font-bold">{p.c}</div>
            <div className="truncate text-[8px] text-dim">{p.r}</div>
          </div>
          <div className="font-display text-[11px] font-bold">{p.v}</div>
        </div>
      ))}
    </div>
  );
}

function MockFactura() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[8px] font-bold uppercase tracking-wide text-dim">Transportes García</div>
          <div className="font-display text-[14px] font-bold">FACT/26-04</div>
        </div>
        <Chip color="var(--green)">Cobrada</Chip>
      </div>
      <div className="mt-2 space-y-1">
        {["Santiago → Madrid", "Lugo → Madrid"].map((l) => (
          <div key={l} className="flex justify-between rounded-[10px] bg-panel2 px-2 py-1.5 text-[9px]">
            <span className="truncate text-dim">{l}</span>
            <span className="font-bold">1.300 €</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-dashed border-line pt-2">
        <span className="text-[9px] font-bold">Total</span>
        <span className="font-display text-[16px] font-bold text-amber">2.662 €</span>
      </div>
      <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-[12px] bg-amber py-2 text-[10px] font-extrabold text-[#1a1205]">
        <Icon name="doc" size={12} /> Descargar PDF
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-1.5 rounded-[12px] border border-line bg-panel2 py-2 text-[10px] font-bold">
        <span className="grid h-4 w-4 place-items-center rounded-full text-white" style={{ background: "#25D366" }}>
          <Icon name="send" size={9} />
        </span>
        Enviar por WhatsApp
      </div>
    </div>
  );
}

function MockGasto() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      {/* ticket */}
      <div className="w-[112px] rounded-t-[8px] bg-white px-2.5 pt-2.5 pb-4 shadow-[var(--shadow)]" style={{ clipPath: "polygon(0 0,100% 0,100% 94%,90% 100%,80% 94%,70% 100%,60% 94%,50% 100%,40% 94%,30% 100%,20% 94%,10% 100%,0 94%)" }}>
        <div className="mx-auto h-1.5 w-12 rounded bg-[#222]" />
        <div className="mt-2 space-y-1">
          <div className="h-1 w-full rounded bg-[#ddd]" />
          <div className="h-1 w-4/5 rounded bg-[#ddd]" />
          <div className="h-1 w-full rounded bg-[#ddd]" />
          <div className="mt-1.5 h-2 w-1/2 rounded bg-[#bbb]" />
        </div>
      </div>
      <div className="my-2 text-amber"><Icon name="image" size={18} /></div>
      <div className="w-full rounded-[12px] border border-line bg-panel2 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold">Gasoil</span>
          <Chip color="var(--green)">Escaneado ✓</Chip>
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-dim">
          <span>IVA 14,62 €</span>
          <span className="font-display text-[13px] font-bold text-text">84,20 €</span>
        </div>
      </div>
    </div>
  );
}

function MockFiscal() {
  return (
    <div>
      <div className="text-[8px] font-bold uppercase tracking-wider text-dim">Resumen fiscal · T2</div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {[
          { t: "IVA repercutido", v: "410 €", c: "var(--text)" },
          { t: "IVA soportado", v: "121 €", c: "var(--text)" },
          { t: "IVA a ingresar", v: "289 €", c: "var(--red)" },
          { t: "IRPF retenido", v: "114 €", c: "var(--text)" },
        ].map((k) => (
          <div key={k.t} className="rounded-[12px] border border-line bg-panel2 px-2 py-2">
            <div className="text-[7.5px] font-bold uppercase tracking-wide text-dim">{k.t}</div>
            <div className="font-display text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex h-[70px] items-end gap-1.5 rounded-[12px] border border-line bg-panel2 p-2">
        <Bar label="T1" h={26} color="var(--green)" />
        <Bar label="T2" h={48} color="var(--green)" />
        <Bar label="T3" h={34} color="var(--green)" />
        <Bar label="T4" h={20} color="var(--amber)" />
      </div>
    </div>
  );
}

function MockVerifactu() {
  // QR "de pega": esquinas localizadoras + patrón estático.
  const cells = "110100111001011010100101101001011010011100101101".split("");
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="rounded-[10px] bg-white p-2.5">
        <div className="grid grid-cols-7 gap-[2px]">
          {Array.from({ length: 49 }).map((_, idx) => {
            const corner = [0, 1, 5, 6, 7, 13, 35, 41, 42, 43, 47, 48].includes(idx);
            const on = corner || cells[idx] === "1";
            return <span key={idx} className="h-[5px] w-[5px] rounded-[1px]" style={{ background: on ? "#111" : "transparent" }} />;
          })}
        </div>
      </div>
      <div className="mt-2.5"><Chip color="var(--green)">Cadena íntegra ✓</Chip></div>
      <div className="mt-2 w-full rounded-[10px] border border-line bg-panel2 p-2">
        <div className="text-[7.5px] font-bold uppercase tracking-wide text-purple" style={{ color: "var(--purple)" }}>Huella Veri*factu (SHA-256)</div>
        <div className="mt-0.5 break-all font-mono text-[7px] leading-tight text-dim">394107E646DC0964947851C57D3C90E5C13F79F5</div>
      </div>
    </div>
  );
}

type Slide = { title: string; text: string; visual: ReactNode };

const SLIDES: Slide[] = [
  { title: "Bienvenido a TrackApp", text: "Tu gestión y facturación de transporte, sin papeleo. Pensada para autónomos al volante.", visual: <MockHome /> },
  { title: "Viajes y portes", text: "Registra cada viaje y los portes de tus clientes. La app calcula los km y tu rentabilidad (€/km).", visual: <MockViaje /> },
  { title: "Facturas en segundos", text: "Junta los portes de un cliente y emite una factura multiporte. Descárgala o mándala por WhatsApp.", visual: <MockFactura /> },
  { title: "Gastos con una foto", text: "Escanea el ticket y la IA lo apunta solo. Verás tu margen real y el gasto por kilómetro.", visual: <MockGasto /> },
  { title: "Listo para Hacienda", text: "IVA a liquidar (modelo 303) e IRPF (130) calculados por trimestre. Sabes cuánto apartar.", visual: <MockFiscal /> },
  { title: "Sistema Veri*factu", text: "Cada factura lleva una huella SHA-256 encadenada y un QR: un registro inalterable. (En pruebas: aún no se envía a la AEAT.)", visual: <MockVerifactu /> },
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
      <div className="flex justify-end px-5 pt-5">
        <button type="button" onClick={close} className="text-[13px] font-bold text-dim">
          Saltar
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-2 text-center">
        {slide.visual}
        <h2 className="mt-5 font-display text-[23px] font-bold leading-tight">{slide.title}</h2>
        <p className="mx-auto mt-2 max-w-[320px] text-[14px] leading-relaxed text-dim">{slide.text}</p>
      </div>

      <div className="flex justify-center gap-2 pb-4">
        {SLIDES.map((_, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Ir al paso ${idx + 1}`}
            onClick={() => setI(idx)}
            className={clsx("h-2 rounded-full transition-all", idx === i ? "w-6 bg-amber" : "w-2 bg-line")}
          />
        ))}
      </div>

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
