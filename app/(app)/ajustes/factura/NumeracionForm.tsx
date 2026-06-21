"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { saveNumeracionAction, type AjustesState } from "../actions";

const initial: AjustesState = {};

export function NumeracionForm({
  values,
}: {
  values: { serie: string; numInicial: number; nextNumero: string; serieTieneFacturas: boolean };
}) {
  const [state, action] = useActionState(saveNumeracionAction, initial);
  const [serie, setSerie] = useState(values.serie);
  const [numInicial, setNumInicial] = useState(String(values.numInicial || ""));

  return (
    <form action={action} className="stagger">
      <div className="mb-4 rounded-2xl border border-line bg-panel px-4 py-3">
        <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-dim">Próxima factura</div>
        <div className="mt-0.5 font-display text-xl font-bold text-amber tnum">{values.nextNumero}</div>
      </div>

      <Field
        label="Serie"
        htmlFor="serie"
        hint="Cambiarla empieza una serie nueva; la anterior se conserva intacta. Tener varias series es legal."
      >
        <input
          id="serie"
          name="serie"
          value={serie}
          onChange={(e) => setSerie(e.target.value)}
          autoCapitalize="characters"
          placeholder="FACT"
        />
      </Field>

      <Field
        label="Nº de la primera factura"
        htmlFor="num_inicial"
        hint="Solo al empezar una serie NUEVA: pon el último número que usaste en otro programa + 1. Déjalo vacío para empezar en 1."
      >
        <input
          id="num_inicial"
          name="num_inicial"
          type="number"
          min="0"
          max="9999999"
          inputMode="numeric"
          value={numInicial}
          onChange={(e) => setNumInicial(e.target.value)}
          placeholder="1"
        />
      </Field>

      {values.serieTieneFacturas && (
        <p className="mb-3 rounded-xl bg-amber-soft px-3.5 py-2.5 text-[12.5px] text-amber">
          La serie <b>{values.serie}</b> ya tiene facturas: su numeración sigue correlativa, así que el{" "}
          <b>nº de la primera factura</b> se ignora (evita huecos). Para arrancar en otro número, cambia a una serie
          nueva.
        </p>
      )}

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

      <Cta icon="save">GUARDAR NUMERACIÓN</Cta>
    </form>
  );
}
