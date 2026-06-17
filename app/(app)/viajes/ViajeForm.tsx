"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { PlaceAutocomplete, type ResolvedPlace } from "@/components/ui/PlaceAutocomplete";
import { DateField } from "@/components/ui/DateField";
import { ClientSelect } from "./ClientSelect";
import { createViajeAction, type TripState } from "./actions";

type ClientOption = { id: string; nombre: string };

const initial: TripState = {};

/**
 * Crea un VIAJE FÍSICO (trayecto + km) con su PRIMER porte (cliente + importe).
 * Para añadir más portes (multiporte) se usa la pantalla de detalle del viaje.
 */
export function ViajeForm({
  clients,
  defaultFecha,
  routingEnabled = false,
}: {
  clients: ClientOption[];
  defaultFecha: string;
  routingEnabled?: boolean;
}) {
  const [state, formAction] = useActionState(createViajeAction, initial);

  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [km, setKm] = useState("");
  const [origenCoord, setOrigenCoord] = useState<ResolvedPlace>(null);
  const [destinoCoord, setDestinoCoord] = useState<ResolvedPlace>(null);
  const [kmStatus, setKmStatus] = useState<"idle" | "calc" | "done" | "error">("idle");

  // Calcula los km de la ruta de camión cuando origen y destino tienen coordenadas.
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

  if (clients.length === 0) {
    return (
      <div className="mt-8 text-center">
        <p className="text-[15px] font-semibold">Primero necesitas un cliente</p>
        <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-dim">
          Cada porte se asigna a un cliente para poder facturarlo.
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
          : "Los km del viaje se cuentan una sola vez";

  return (
    <form action={formAction} className="stagger">
      <div className="mb-1.5 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">El viaje (trayecto)</div>

      <Field label="Fecha" htmlFor="fecha">
        <DateField id="fecha" name="fecha" defaultISO={defaultFecha} />
      </Field>

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

      <Field label="Km del viaje" htmlFor="km" hint={kmHint}>
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

      <div className="mb-1.5 mt-5 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Primer porte</div>

      <Field label="Cliente" htmlFor="client_id">
        <ClientSelect clients={clients} name="client_id" />
      </Field>

      <Field label="Descripción de la carga" htmlFor="descripcion" hint="Opcional · tipo de carga, observaciones…">
        <input id="descripcion" name="descripcion" placeholder="Fruta · carga completa" />
      </Field>

      <Field label="Peso de la carga" htmlFor="peso" hint="Opcional">
        <div className="flex gap-2">
          <input id="peso" name="peso" type="number" step="0.001" min="0" inputMode="decimal" placeholder="24" className="flex-1" />
          <select name="peso_unidad" defaultValue="t" className="w-24 flex-none">
            <option value="t">t</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </Field>

      <Field label="Importe del porte (€)" htmlFor="importe">
        <input
          id="importe"
          name="importe"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="1240.00"
          required
          className="font-display !text-2xl"
        />
      </Field>

      {state.error && (
        <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{state.error}</p>
      )}

      <Cta icon="save">GUARDAR VIAJE</Cta>
      <p className="mt-2 px-1 text-center text-[11.5px] text-dim">
        Después podrás añadir más portes a este viaje (para otros clientes) desde su ficha.
      </p>
    </form>
  );
}
