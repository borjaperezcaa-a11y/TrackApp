"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import type { VehiculoState } from "./actions";

export type VehiculoValues = { nombre: string; matricula: string };

const initial: VehiculoState = {};

export function VehiculoForm({
  action,
  values,
  submitLabel,
}: {
  action: (prev: VehiculoState, formData: FormData) => Promise<VehiculoState>;
  values: VehiculoValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initial);

  return (
    <form action={formAction} className="stagger">
      <Field label="Nombre del camión" htmlFor="nombre" hint="Un alias para reconocerlo. Ej.: Volvo FH, Camión 1">
        <input id="nombre" name="nombre" defaultValue={values.nombre} placeholder="Volvo FH" required />
      </Field>

      <Field label="Matrícula" htmlFor="matricula" hint="Opcional">
        <input id="matricula" name="matricula" defaultValue={values.matricula} placeholder="1234 LMN" autoCapitalize="characters" />
      </Field>

      {state.error && (
        <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{state.error}</p>
      )}

      <Cta icon="save">{submitLabel}</Cta>
    </form>
  );
}
