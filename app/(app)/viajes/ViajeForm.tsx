"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { Icon } from "@/components/ui/Icon";
import { PlaceAutocomplete, type ResolvedPlace } from "@/components/ui/PlaceAutocomplete";
import { DateField } from "@/components/ui/DateField";
import { createViajeAction, type TripState } from "./actions";
import { quickCreateClient } from "../clientes/actions";

type ClientOption = { id: string; nombre: string };
type PorteDraft = {
  client_id: string;
  origen: string;
  destino: string;
  descripcion: string;
  peso: string;
  peso_unidad: "t" | "kg";
  importe: string;
};

const initial: TripState = {};
const emptyPorte = (origen = "", destino = ""): PorteDraft => ({
  client_id: "",
  origen,
  destino,
  descripcion: "",
  peso: "",
  peso_unidad: "kg", // por defecto kg
  importe: "",
});

/**
 * Crea un VIAJE FÍSICO (trayecto + km) con UNO O VARIOS portes. Cada porte es
 * independiente: su cliente, su origen/destino y su precio. Los portes se envían
 * serializados (JSON) en un campo oculto a la server action.
 */
export function ViajeForm({
  clients: initialClients,
  defaultFecha,
  routingEnabled = false,
}: {
  clients: ClientOption[];
  defaultFecha: string;
  routingEnabled?: boolean;
}) {
  const [state, formAction] = useActionState(createViajeAction, initial);
  const [clients, setClients] = useState(initialClients);

  // Trayecto físico
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [km, setKm] = useState("");
  const [origenCoord, setOrigenCoord] = useState<ResolvedPlace>(null);
  const [destinoCoord, setDestinoCoord] = useState<ResolvedPlace>(null);
  const [kmStatus, setKmStatus] = useState<"idle" | "calc" | "done" | "error">("idle");

  // Portes (al menos uno)
  const [portes, setPortes] = useState<PorteDraft[]>([emptyPorte()]);

  // Modal "nuevo cliente" (asociado al porte que lo abrió)
  const [modalIdx, setModalIdx] = useState<number | null>(null);
  const [newNombre, setNewNombre] = useState("");
  const [newNif, setNewNif] = useState("");
  const [creating, setCreating] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (!routingEnabled || !origenCoord || !destinoCoord) return;
    let alive = true;
    setKmStatus("calc");
    fetch("/api/distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: origenCoord, to: destinoCoord }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("distance"))))
      .then((d: { km?: number }) => {
        if (!alive) return;
        if (typeof d.km === "number" && Number.isFinite(d.km)) {
          setKm(String(d.km));
          setKmStatus("done");
        } else setKmStatus("error");
      })
      .catch(() => {
        if (alive) setKmStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [origenCoord, destinoCoord, routingEnabled]);

  function setPorte(i: number, patch: Partial<PorteDraft>) {
    setPortes((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function addPorte() {
    // El nuevo porte hereda la ruta del trayecto (editable).
    setPortes((ps) => [...ps, emptyPorte(origen, destino)]);
  }
  function removePorte(i: number) {
    setPortes((ps) => (ps.length > 1 ? ps.filter((_, idx) => idx !== i) : ps));
  }

  async function createClient() {
    setClientError(null);
    if (!newNombre.trim()) {
      setClientError("El nombre es obligatorio");
      return;
    }
    setCreating(true);
    const res = await quickCreateClient({ nombre: newNombre.trim(), nif: newNif.trim() });
    setCreating(false);
    if (res.error || !res.id || !res.nombre) {
      setClientError(res.error ?? "No se pudo crear el cliente.");
      return;
    }
    const nuevo = { id: res.id, nombre: res.nombre };
    setClients((l) => [...l, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
    if (modalIdx != null) setPorte(modalIdx, { client_id: nuevo.id });
    setModalIdx(null);
    setNewNombre("");
    setNewNif("");
  }

  if (clients.length === 0) {
    return (
      <div className="mt-8 text-center">
        <p className="text-[15px] font-semibold">Primero necesitas un cliente</p>
        <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-dim">
          Cada porte se asigna a un cliente para poder facturarlo.
        </p>
        <Link href="/clientes/nuevo" className="mt-5 inline-flex rounded-2xl bg-amber px-5 py-3 text-sm font-extrabold text-[#1a1205]">
          Crear cliente
        </Link>
      </div>
    );
  }

  const kmHint =
    kmStatus === "calc"
      ? "Calculando ruta de camión…"
      : kmStatus === "done"
        ? "≈ km por carretera (camión) · editable"
        : kmStatus === "error"
          ? "No se pudo calcular la ruta; ponlo a mano"
          : "Los km del viaje se cuentan una sola vez";

  return (
    <form action={formAction} className="stagger">
      {/* Los portes viajan serializados aquí */}
      <input type="hidden" name="portes" value={JSON.stringify(portes)} />

      <div className="mb-1.5 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">El viaje (trayecto)</div>

      <Field label="Fecha" htmlFor="fecha">
        <DateField id="fecha" name="fecha" defaultISO={defaultFecha} />
      </Field>
      <Field label="Origen" htmlFor="origen" hint={routingEnabled ? "Busca y elige un lugar" : "Con CP: Santiago (15890)"}>
        <PlaceAutocomplete id="origen" name="origen" value={origen} onChange={setOrigen} onResolve={setOrigenCoord} enabled={routingEnabled} placeholder="Santiago (15890)" required />
      </Field>
      <Field label="Destino" htmlFor="destino" hint={routingEnabled ? "Busca y elige un lugar" : "Parma - IT (43122)"}>
        <PlaceAutocomplete id="destino" name="destino" value={destino} onChange={setDestino} onResolve={setDestinoCoord} enabled={routingEnabled} placeholder="Irún (20305)" required />
      </Field>
      <Field label="Km del viaje" htmlFor="km" hint={kmHint}>
        <input id="km" name="km" type="number" step="1" min="0" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="940" />
      </Field>

      <div className="mb-1.5 mt-5 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">
        Portes ({portes.length})
      </div>

      {portes.map((p, i) => (
        <div key={i} className="mb-3 rounded-2xl border border-line bg-panel p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Porte {i + 1}</span>
            {portes.length > 1 && (
              <button type="button" onClick={() => removePorte(i)} className="text-[12.5px] font-bold text-red">
                Quitar
              </button>
            )}
          </div>

          <Field label="Cliente" htmlFor={`pc-${i}`}>
            <select id={`pc-${i}`} value={p.client_id} onChange={(e) => setPorte(i, { client_id: e.target.value })} required>
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
              onClick={() => {
                setClientError(null);
                setNewNombre("");
                setNewNif("");
                setModalIdx(i);
              }}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-line bg-amber-soft py-2.5 text-[13.5px] font-bold text-amber transition-transform active:scale-[0.98]"
            >
              <Icon name="plus" size={16} /> Nuevo cliente
            </button>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Origen" htmlFor={`po-${i}`}>
              <input id={`po-${i}`} value={p.origen} onChange={(e) => setPorte(i, { origen: e.target.value })} placeholder="Santiago (15890)" />
            </Field>
            <Field label="Destino" htmlFor={`pd-${i}`}>
              <input id={`pd-${i}`} value={p.destino} onChange={(e) => setPorte(i, { destino: e.target.value })} placeholder="Irún (20305)" />
            </Field>
          </div>

          <Field label="Descripción" htmlFor={`pdesc-${i}`} hint="Opcional">
            <input id={`pdesc-${i}`} value={p.descripcion} onChange={(e) => setPorte(i, { descripcion: e.target.value })} placeholder="Fruta · carga completa" />
          </Field>

          <Field label="Carga (peso)" htmlFor={`pp-${i}`} hint="Opcional">
            <div className="flex gap-2">
              <input
                id={`pp-${i}`}
                type="number"
                step="0.001"
                min="0"
                inputMode="decimal"
                value={p.peso}
                onChange={(e) => setPorte(i, { peso: e.target.value })}
                placeholder="24"
                className="flex-1"
              />
              <select
                value={p.peso_unidad}
                onChange={(e) => setPorte(i, { peso_unidad: e.target.value as "t" | "kg" })}
                className="w-24 flex-none"
              >
                <option value="kg">kg</option>
                <option value="t">t</option>
              </select>
            </div>
          </Field>

          <Field label="Importe (€)" htmlFor={`pi-${i}`}>
            <input
              id={`pi-${i}`}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={p.importe}
              onChange={(e) => setPorte(i, { importe: e.target.value })}
              placeholder="1240.00"
              required
              className="font-display !text-xl"
            />
          </Field>
        </div>
      ))}

      <button
        type="button"
        onClick={addPorte}
        className="mb-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-panel py-3 text-[13.5px] font-bold text-text transition-transform active:scale-[0.98]"
      >
        <Icon name="plus" size={16} /> Añadir otro porte
      </button>

      <p className="mb-3 px-1 text-[11.5px] text-dim">
        Si dejas el origen/destino de un porte en blanco, usa la ruta del viaje. Los km solo se ponen en el viaje (una vez).
      </p>

      {state.error && <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{state.error}</p>}

      <Cta icon="save">GUARDAR VIAJE</Cta>

      {modalIdx != null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/55 p-4 sm:items-center"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setModalIdx(null);
            }}
          >
            <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-xl">
              <h3 className="mb-3 font-display text-lg font-bold">Nuevo cliente</h3>
              <Field label="Nombre" htmlFor="nc-nombre">
                <input id="nc-nombre" value={newNombre} onChange={(e) => setNewNombre(e.target.value)} placeholder="Transportes García S.L." autoFocus />
              </Field>
              <Field label="NIF / CIF" htmlFor="nc-nif" hint="Opcional">
                <input id="nc-nif" value={newNif} onChange={(e) => setNewNif(e.target.value)} placeholder="B12345674" />
              </Field>
              {clientError && <p className="mb-2 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{clientError}</p>}
              <div className="mt-1 flex gap-2.5">
                <button type="button" onClick={() => setModalIdx(null)} className="flex-1 rounded-[16px] border border-line bg-panel py-3.5 text-sm font-bold text-text">
                  Cancelar
                </button>
                <button type="button" onClick={createClient} disabled={creating} className="flex-1 rounded-[16px] bg-amber py-3.5 text-sm font-extrabold text-[#1a1205] transition-transform active:scale-[0.97] disabled:opacity-60">
                  {creating ? "Creando…" : "Crear cliente"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </form>
  );
}
