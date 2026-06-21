"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { clsx } from "@/lib/clsx";
import { saveImpuestosAction, type AjustesState } from "../actions";

const IVA_OPTS = [21, 10, 4, 0];
const initial: AjustesState = {};

export function ImpuestosForm({ values }: { values: { iva_def: number; irpf_def: number } }) {
  const [state, action] = useActionState(saveImpuestosAction, initial);
  const [iva, setIva] = useState<number>(values.iva_def);
  const [irpf, setIrpf] = useState(String(values.irpf_def));

  return (
    <form action={action} className="stagger">
      <Field label="IVA por defecto">
        <div className="flex flex-wrap gap-2">
          {IVA_OPTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setIva(v)}
              aria-pressed={iva === v}
              className={clsx(
                "rounded-[13px] border-[1.5px] px-4 py-2.5 text-sm font-bold transition-all",
                iva === v ? "border-amber bg-amber-soft text-amber" : "border-line bg-panel text-text",
              )}
            >
              {v}%
            </button>
          ))}
        </div>
        <input type="hidden" name="iva_def" value={iva} />
      </Field>

      <Field label="IRPF por defecto (%)" htmlFor="irpf_def" hint="Transporte en módulos: suele ser 1%">
        <input
          id="irpf_def"
          name="irpf_def"
          type="number"
          step="0.5"
          min="0"
          max="100"
          inputMode="decimal"
          value={irpf}
          onChange={(e) => setIrpf(e.target.value)}
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

      <Cta icon="save">GUARDAR IMPUESTOS</Cta>
    </form>
  );
}
