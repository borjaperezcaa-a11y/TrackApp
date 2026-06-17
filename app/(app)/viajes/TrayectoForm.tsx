"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { DateField } from "@/components/ui/DateField";
import type { TripState } from "./actions";

/** Editar el trayecto del viaje físico (fecha, ruta y km). */
export function TrayectoForm({
  action,
  defaults,
}: {
  action: (prev: TripState, formData: FormData) => Promise<TripState>;
  defaults: { fecha: string; origen: string; destino: string; km: string };
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="stagger">
      <Field label="Fecha" htmlFor="t-fecha">
        <DateField id="t-fecha" name="fecha" defaultISO={defaults.fecha} />
      </Field>
      <Field label="Origen" htmlFor="t-origen">
        <input id="t-origen" name="origen" defaultValue={defaults.origen} placeholder="Santiago (15890)" />
      </Field>
      <Field label="Destino" htmlFor="t-destino">
        <input id="t-destino" name="destino" defaultValue={defaults.destino} placeholder="Irún (20305)" />
      </Field>
      <Field label="Km del viaje" htmlFor="t-km" hint="Se cuentan una sola vez">
        <input
          id="t-km"
          name="km"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          defaultValue={defaults.km}
          placeholder="940"
        />
      </Field>

      {state.error && (
        <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{state.error}</p>
      )}

      <Cta icon="save">GUARDAR TRAYECTO</Cta>
    </form>
  );
}
