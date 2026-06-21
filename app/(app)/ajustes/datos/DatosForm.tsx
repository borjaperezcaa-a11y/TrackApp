"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { saveDatosAction, type AjustesState } from "../actions";

export type DatosValues = {
  nombre: string;
  nif: string;
  direccion: string;
  cp_localidad: string;
  iban: string;
};

const initial: AjustesState = {};

export function DatosForm({ values }: { values: DatosValues }) {
  const [state, action] = useActionState(saveDatosAction, initial);
  const [nombre, setNombre] = useState(values.nombre);
  const [nif, setNif] = useState(values.nif);
  const [direccion, setDireccion] = useState(values.direccion);
  const [cpLocalidad, setCpLocalidad] = useState(values.cp_localidad);
  const [iban, setIban] = useState(values.iban);

  return (
    <form action={action} className="stagger">
      <Field label="Nombre o razón social" htmlFor="nombre">
        <input id="nombre" name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre o razón social" />
      </Field>
      <Field label="NIF / CIF" htmlFor="nif">
        <input id="nif" name="nif" value={nif} onChange={(e) => setNif(e.target.value)} placeholder="Tu NIF o CIF" autoCapitalize="characters" />
      </Field>
      <Field label="Dirección" htmlFor="direccion">
        <input id="direccion" name="direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número" />
      </Field>
      <Field label="CP y localidad" htmlFor="cp_localidad">
        <input id="cp_localidad" name="cp_localidad" value={cpLocalidad} onChange={(e) => setCpLocalidad(e.target.value)} placeholder="CP y localidad" />
      </Field>
      <Field label="IBAN" htmlFor="iban">
        <input id="iban" name="iban" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" autoCapitalize="characters" />
      </Field>

      {state.error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mb-3 rounded-xl bg-green-soft px-3 py-2 text-sm font-semibold text-green">
          {state.message ?? "Guardado ✓"}
        </p>
      )}

      <Cta icon="save">GUARDAR DATOS</Cta>
    </form>
  );
}
