"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { Icon } from "@/components/ui/Icon";
import { lookupCp } from "@/lib/cp-lookup";
import { NewClientModal } from "./NewClientModal";
import type { TripState } from "./actions";

type ClientOption = { id: string; nombre: string };
type Stop = { lugar: string; cp: string };

const emptyStop = (): Stop => ({ lugar: "", cp: "" });

/**
 * Añadir un porte a un viaje existente: cliente, cargas/descargas (con CP y
 * grupaje), descripción, peso e importe. El porte viaja serializado (JSON).
 */
export function PorteForm({
  action,
  clients: initialClients,
  submitLabel = "AÑADIR PORTE",
}: {
  action: (prev: TripState, formData: FormData) => Promise<TripState>;
  clients: ClientOption[];
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [clients, setClients] = useState(initialClients);
  const [clientId, setClientId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [origenes, setOrigenes] = useState<Stop[]>([emptyStop()]);
  const [destinos, setDestinos] = useState<Stop[]>([emptyStop()]);
  const [descripcion, setDescripcion] = useState("");
  const [peso, setPeso] = useState("");
  const [pesoUnidad, setPesoUnidad] = useState<"t" | "kg">("kg");
  const [importe, setImporte] = useState("");

  const porteJson = JSON.stringify({
    client_id: clientId,
    origenes,
    destinos,
    descripcion,
    peso,
    peso_unidad: pesoUnidad,
    importe,
  });

  function renderStops(stops: Stop[], setStops: (s: Stop[]) => void, label: string) {
    const set = (j: number, key: keyof Stop, val: string) => setStops(stops.map((s, k) => (k === j ? { ...s, [key]: val } : s)));
    return (
      <div>
        <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-[0.1em] text-dim">{label}</div>
        {stops.map((s, j) => (
          <div key={j} className="mb-1.5 flex gap-2">
            <input
              value={s.cp}
              onChange={(e) => set(j, "cp", e.target.value)}
              onBlur={async () => {
                if (s.cp.trim() && !s.lugar.trim()) {
                  const r = await lookupCp(s.cp);
                  if (r.localidad) set(j, "lugar", r.localidad);
                }
              }}
              placeholder="CP"
              inputMode="numeric"
              maxLength={5}
              aria-label="Código postal"
              className="w-20 flex-none text-center"
            />
            <input value={s.lugar} onChange={(e) => set(j, "lugar", e.target.value)} placeholder="Localidad" aria-label="Localidad" className="flex-1" />
            {stops.length > 1 && (
              <button
                type="button"
                onClick={() => setStops(stops.filter((_, k) => k !== j))}
                aria-label="Quitar parada"
                className="flex-none rounded-xl border border-line px-3 font-bold text-dim"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setStops([...stops, emptyStop()])} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-amber">
          <Icon name="plus" size={13} /> Añadir {label.toLowerCase().includes("carga") ? "carga" : "descarga"}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="stagger">
      <input type="hidden" name="porte" value={porteJson} />

      <Field label="Cliente" htmlFor="pf-cliente">
        <select id="pf-cliente" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
          <option value="" disabled>
            Selecciona un cliente…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-line bg-amber-soft py-2.5 text-[13.5px] font-bold text-amber transition-transform active:scale-[0.98]"
        >
          <Icon name="plus" size={16} /> Nuevo cliente
        </button>
      </Field>

      <div className="mb-3 space-y-2.5">
        {renderStops(origenes, setOrigenes, "Cargas (orígenes)")}
        {renderStops(destinos, setDestinos, "Descargas (destinos)")}
      </div>
      <p className="mb-3 px-1 text-[11.5px] text-dim">Si dejas la ruta vacía, usa la del viaje. El CP rellena la localidad.</p>

      <Field label="Descripción" htmlFor="pf-desc" hint="Opcional">
        <input id="pf-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Fruta · carga completa" />
      </Field>

      <Field label="Carga (peso)" htmlFor="pf-peso" hint="Opcional">
        <div className="flex gap-2">
          <input id="pf-peso" type="number" step="0.001" min="0" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="24" className="flex-1" />
          <select value={pesoUnidad} onChange={(e) => setPesoUnidad(e.target.value as "t" | "kg")} className="w-24 flex-none">
            <option value="kg">kg</option>
            <option value="t">t</option>
          </select>
        </div>
      </Field>

      <Field label="Importe (€)" htmlFor="pf-importe">
        <input
          id="pf-importe"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={importe}
          onChange={(e) => setImporte(e.target.value)}
          placeholder="1240.00"
          required
          className="font-display !text-2xl"
        />
      </Field>

      {state.error && <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{state.error}</p>}

      <Cta icon="save">{submitLabel}</Cta>

      <NewClientModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(c) => {
          setClients((l) => [...l, c].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
          setClientId(c.id);
          setModalOpen(false);
        }}
      />
    </form>
  );
}
