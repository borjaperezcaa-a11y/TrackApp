"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { Icon } from "@/components/ui/Icon";
import { PlaceAutocomplete, type ResolvedPlace } from "@/components/ui/PlaceAutocomplete";
import { DateField } from "@/components/ui/DateField";
import { quickCreateClient } from "../clientes/actions";
import type { TripState } from "./actions";

export type TripValues = {
  fecha: string;
  client_id: string;
  origen: string;
  destino: string;
  descripcion: string;
  peso: string;
  peso_unidad: "t" | "kg";
  km: string;
  importe: string;
};

type ClientOption = { id: string; nombre: string };

const initial: TripState = {};

export function TripForm({
  action,
  values,
  clients,
  submitLabel,
  routingEnabled = false,
}: {
  action: (prev: TripState, formData: FormData) => Promise<TripState>;
  values: TripValues;
  clients: ClientOption[];
  submitLabel: string;
  routingEnabled?: boolean;
}) {
  const [state, formAction] = useActionState(action, initial);

  // Lista de clientes y selección, en estado para poder añadir uno desde el modal.
  const [clientList, setClientList] = useState(clients);
  const [clientId, setClientId] = useState(values.client_id);

  // Campos controlados que participan en el buscador de ruta / cálculo de km.
  const [origen, setOrigen] = useState(values.origen);
  const [destino, setDestino] = useState(values.destino);
  const [km, setKm] = useState(values.km);
  const [origenCoord, setOrigenCoord] = useState<ResolvedPlace>(null);
  const [destinoCoord, setDestinoCoord] = useState<ResolvedPlace>(null);
  const [kmStatus, setKmStatus] = useState<"idle" | "calc" | "done" | "error">("idle");

  // Modal "Nuevo cliente" (crear sin salir del formulario de viaje).
  const [modalOpen, setModalOpen] = useState(false);
  const [newNombre, setNewNombre] = useState("");
  const [newNif, setNewNif] = useState("");
  const [creating, setCreating] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  // Cuando origen y destino tienen coordenadas (elegidos del buscador), calcula
  // los km de la ruta de camión y los rellena. El campo sigue siendo editable.
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
        } else {
          setKmStatus("error");
        }
      })
      .catch(() => {
        if (alive) setKmStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [origenCoord, destinoCoord, routingEnabled]);

  function openClientModal() {
    setClientError(null);
    setNewNombre("");
    setNewNif("");
    setModalOpen(true);
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
    setClientList((list) =>
      [...list, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    );
    setClientId(nuevo.id); // queda seleccionado
    setModalOpen(false);
  }

  if (clientList.length === 0) {
    return (
      <div className="mt-8 text-center">
        <p className="text-[15px] font-semibold">Primero necesitas un cliente</p>
        <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-dim">
          Un viaje se asigna a un cliente para poder facturarlo.
        </p>
        <Link
          href="/clientes/nuevo"
          className="mt-5 inline-flex rounded-2xl bg-amber px-5 py-3 text-sm font-extrabold text-[#1a1205]"
        >
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
          : undefined;

  return (
    <form action={formAction} className="stagger">
      <Field label="Fecha" htmlFor="fecha">
        <DateField id="fecha" name="fecha" defaultISO={values.fecha} />
      </Field>

      <Field label="Cliente" htmlFor="client_id">
        <select
          id="client_id"
          name="client_id"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
        >
          <option value="" disabled>
            Selecciona un cliente…
          </option>
          {clientList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={openClientModal}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-line bg-amber-soft py-2.5 text-[13.5px] font-bold text-amber transition-transform active:scale-[0.98]"
        >
          <Icon name="plus" size={16} /> Nuevo cliente
        </button>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Origen" htmlFor="origen" hint={routingEnabled ? "Busca y elige un lugar" : "Con CP: Santiago (15890)"}>
          <PlaceAutocomplete
            id="origen"
            name="origen"
            value={origen}
            onChange={setOrigen}
            onResolve={setOrigenCoord}
            enabled={routingEnabled}
            placeholder="Santiago (15890)"
          />
        </Field>
        <Field label="Destino" htmlFor="destino" hint={routingEnabled ? "Busca y elige un lugar" : "Parma - IT (43122)"}>
          <PlaceAutocomplete
            id="destino"
            name="destino"
            value={destino}
            onChange={setDestino}
            onResolve={setDestinoCoord}
            enabled={routingEnabled}
            placeholder="Irún (20305)"
          />
        </Field>
      </div>

      <Field label="Descripción de la carga" htmlFor="descripcion" hint="Opcional · tipo de carga, observaciones…">
        <input id="descripcion" name="descripcion" defaultValue={values.descripcion} placeholder="Fruta · carga completa" />
      </Field>

      <Field label="Peso de la carga" htmlFor="peso" hint="Opcional · se guarda para futuras estadísticas por carga">
        <div className="flex gap-2">
          <input
            id="peso"
            name="peso"
            type="number"
            step="0.001"
            min="0"
            inputMode="decimal"
            defaultValue={values.peso}
            placeholder="24"
            className="flex-1"
          />
          <select name="peso_unidad" defaultValue={values.peso_unidad} className="w-24 flex-none">
            <option value="t">t</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Km" htmlFor="km" hint={kmHint}>
          <input
            id="km"
            name="km"
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="940"
          />
        </Field>
        <Field label="Importe (€)" htmlFor="importe">
          <input
            id="importe"
            name="importe"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={values.importe}
            placeholder="1240.00"
            required
            className="font-display !text-2xl"
          />
        </Field>
      </div>

      {state.error && (
        <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
          {state.error}
        </p>
      )}

      <Cta icon="save">{submitLabel}</Cta>

      {modalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/55 p-4 sm:items-center"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-xl">
              <h3 className="mb-3 font-display text-lg font-bold">Nuevo cliente</h3>
              <Field label="Nombre" htmlFor="nc-nombre">
                <input
                  id="nc-nombre"
                  value={newNombre}
                  onChange={(e) => setNewNombre(e.target.value)}
                  placeholder="Transportes García S.L."
                  autoFocus
                />
              </Field>
              <Field label="NIF / CIF" htmlFor="nc-nif" hint="Opcional">
                <input
                  id="nc-nif"
                  value={newNif}
                  onChange={(e) => setNewNif(e.target.value)}
                  placeholder="B12345674"
                />
              </Field>
              {clientError && (
                <p className="mb-2 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
                  {clientError}
                </p>
              )}
              <div className="mt-1 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 rounded-[16px] border border-line bg-panel py-3.5 text-sm font-bold text-text"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createClient}
                  disabled={creating}
                  className="flex-1 rounded-[16px] bg-amber py-3.5 text-sm font-extrabold text-[#1a1205] transition-transform active:scale-[0.97] disabled:opacity-60"
                >
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
