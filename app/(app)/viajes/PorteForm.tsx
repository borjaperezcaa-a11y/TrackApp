"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { ClientSelect } from "./ClientSelect";
import type { TripState } from "./actions";

type ClientOption = { id: string; nombre: string };

export type PorteDefaults = {
  client_id?: string;
  origen?: string;
  destino?: string;
  descripcion?: string;
  peso?: string;
  peso_unidad?: "t" | "kg";
  importe?: string;
};

/** Formulario de un porte (carga de un cliente). Sirve para añadir y editar. */
export function PorteForm({
  action,
  clients,
  defaults,
  submitLabel = "AÑADIR PORTE",
}: {
  action: (prev: TripState, formData: FormData) => Promise<TripState>;
  clients: ClientOption[];
  defaults?: PorteDefaults;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="stagger">
      <Field label="Cliente" htmlFor="client_id">
        <ClientSelect clients={clients} name="client_id" defaultValue={defaults?.client_id ?? ""} />
      </Field>

      <Field label="Origen del porte" htmlFor="p-origen" hint="Viene de la ruta del viaje; cámbialo si este porte es distinto">
        <input id="p-origen" name="origen" defaultValue={defaults?.origen ?? ""} placeholder="Santiago (15890)" required />
      </Field>
      <Field label="Destino del porte" htmlFor="p-destino">
        <input id="p-destino" name="destino" defaultValue={defaults?.destino ?? ""} placeholder="Irún (20305)" required />
      </Field>

      <Field label="Descripción de la carga" htmlFor="p-descripcion" hint="Opcional">
        <input id="p-descripcion" name="descripcion" defaultValue={defaults?.descripcion ?? ""} placeholder="Fruta · carga completa" />
      </Field>

      <Field label="Peso de la carga" htmlFor="p-peso" hint="Opcional">
        <div className="flex gap-2">
          <input
            id="p-peso"
            name="peso"
            type="number"
            step="0.001"
            min="0"
            inputMode="decimal"
            defaultValue={defaults?.peso ?? ""}
            placeholder="24"
            className="flex-1"
          />
          <select name="peso_unidad" defaultValue={defaults?.peso_unidad ?? "t"} className="w-24 flex-none">
            <option value="t">t</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </Field>

      <Field label="Importe del porte (€)" htmlFor="p-importe">
        <input
          id="p-importe"
          name="importe"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          defaultValue={defaults?.importe ?? ""}
          placeholder="1240.00"
          required
          className="font-display !text-2xl"
        />
      </Field>

      {state.error && (
        <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{state.error}</p>
      )}

      <Cta icon="save">{submitLabel}</Cta>
    </form>
  );
}
