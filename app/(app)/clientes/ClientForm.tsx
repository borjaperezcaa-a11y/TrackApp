"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import type { ClientState } from "./actions";

export type ClientValues = {
  nombre: string;
  nif: string;
  direccion: string;
  cp_localidad: string;
  condiciones_pago: string;
};

const initial: ClientState = {};

export function ClientForm({
  action,
  values,
  submitLabel,
  next,
}: {
  action: (prev: ClientState, formData: FormData) => Promise<ClientState>;
  values: ClientValues;
  submitLabel: string;
  next?: string;
}) {
  const [state, formAction] = useActionState(action, initial);

  return (
    <form action={formAction} className="stagger">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Nombre o razón social" htmlFor="nombre">
        <input id="nombre" name="nombre" defaultValue={values.nombre} placeholder="Transportes García S.L." required />
      </Field>

      <Field label="NIF / CIF" htmlFor="nif">
        <input id="nif" name="nif" defaultValue={values.nif} placeholder="B30000000" autoCapitalize="characters" />
      </Field>

      <Field label="Dirección" htmlFor="direccion">
        <input id="direccion" name="direccion" defaultValue={values.direccion} placeholder="Calle, número" />
      </Field>

      <Field label="CP y localidad" htmlFor="cp_localidad">
        <input id="cp_localidad" name="cp_localidad" defaultValue={values.cp_localidad} placeholder="30100 Murcia" />
      </Field>

      <Field label="Condiciones de pago" htmlFor="condiciones_pago" hint="Ej. Pago a 60 días">
        <input id="condiciones_pago" name="condiciones_pago" defaultValue={values.condiciones_pago} placeholder="Pago a 60 días" />
      </Field>

      {state.error && (
        <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
          {state.error}
        </p>
      )}

      <Cta icon="save">{submitLabel}</Cta>
    </form>
  );
}
