"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { clsx } from "@/lib/clsx";
import { saveClausulaAction, type AjustesState } from "../actions";

const PRESETS: { label: string; text: string }[] = [
  {
    label: "Aceptación tácita",
    text: "La presente factura se entenderá aceptada en el momento de su cobro salvo que de forma expresa sea rechazada en el plazo de 15 días contados desde su recepción.",
  },
  {
    label: "Intereses de demora",
    text: "El impago a la fecha de vencimiento devengará intereses de demora conforme a la Ley 3/2004, de 29 de diciembre, de lucha contra la morosidad en las operaciones comerciales.",
  },
  {
    label: "Protección de datos",
    text: "Los datos personales se tratan conforme al RGPD (UE) 2016/679 y la LOPDGDD 3/2018, con la finalidad de gestionar la relación comercial y la facturación. Puede ejercer sus derechos dirigiéndose al emisor.",
  },
];

const initial: AjustesState = {};

export function ClausulaForm({ values }: { values: { activa: boolean; texto: string } }) {
  const [state, action] = useActionState(saveClausulaAction, initial);
  const [activa, setActiva] = useState(values.activa);
  const [texto, setTexto] = useState(values.texto);

  return (
    <form action={action} className="stagger">
      <input type="hidden" name="clausula_activa" value={activa ? "on" : ""} />

      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5">
        <label htmlFor="clausula-switch" className="min-w-0 cursor-pointer">
          <span className="block text-sm font-bold">Mostrar la cláusula en mis facturas</span>
          <span className="block text-[12px] text-dim">Aparece como texto de condiciones al pie de la factura.</span>
        </label>
        <button
          id="clausula-switch"
          type="button"
          role="switch"
          aria-checked={activa}
          aria-label="Mostrar la cláusula en mis facturas"
          onClick={() => setActiva((v) => !v)}
          className={clsx(
            "relative h-7 w-12 flex-none rounded-full transition-colors",
            activa ? "bg-amber" : "bg-line",
          )}
        >
          <span
            className={clsx(
              "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
              activa ? "left-6" : "left-1",
            )}
          />
        </button>
      </div>

      <div className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Plantillas recomendadas</div>
      <div className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setTexto(p.text)}
            className="rounded-[13px] border border-line bg-panel2 px-3 py-2 text-[12.5px] font-bold text-text transition-transform active:scale-95"
          >
            {p.label}
          </button>
        ))}
      </div>

      <Field label="Texto de la cláusula" htmlFor="clausula_texto" hint="Máx. 600 caracteres. Edítalo libremente o parte de una plantilla.">
        <textarea
          id="clausula_texto"
          name="clausula_texto"
          rows={4}
          maxLength={600}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe tu cláusula de condiciones o elige una plantilla…"
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

      <Cta icon="save">GUARDAR CLÁUSULA</Cta>
    </form>
  );
}
