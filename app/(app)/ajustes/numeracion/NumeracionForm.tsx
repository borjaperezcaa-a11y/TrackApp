"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { saveNumeracionAction, type AjustesState } from "../actions";

const initial: AjustesState = {};

export function NumeracionForm({
  values,
}: {
  values: { serie: string; numInicial: number; nextNumero: string; locked: boolean };
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

      {values.locked ? (
        <p className="rounded-xl bg-amber-soft px-3.5 py-3 text-[13px] font-medium text-amber">
          Ya has emitido facturas, así que la serie y el número de arranque <b>no se pueden cambiar</b>: la cadena de
          numeración ya está iniciada y modificarla rompería la correlación (lo exige Verifactu).
        </p>
      ) : (
        <>
          <Field label="Serie" htmlFor="serie" hint="Letras, números y / _ -. Ej.: FACT, A, 2026">
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
            hint="Si ya facturabas con otro programa, pon el último número usado + 1. Déjalo vacío para empezar en 1."
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
        </>
      )}
    </form>
  );
}
