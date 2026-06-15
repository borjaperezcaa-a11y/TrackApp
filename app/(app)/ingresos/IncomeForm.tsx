"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { clsx } from "@/lib/clsx";
import { round2, parseDecimal } from "@/lib/format";
import type { IncomePayload, IncomeState } from "./actions";

const IVA_OPTS = [21, 10, 4, 0];
const num = parseDecimal;

export type IncomeValues = {
  concepto: string;
  cliente: string;
  fecha: string;
  base: string;
  iva_rate: string;
  iva: string;
  total: string;
  cobrada: boolean;
};

function optNum(s: string): number | null {
  if (s.trim() === "") return null;
  const n = num(s);
  return Number.isFinite(n) ? n : null;
}

export function IncomeForm({
  values,
  action,
  submitLabel,
  clients = [],
}: {
  values: IncomeValues;
  action: (payload: IncomePayload) => Promise<IncomeState>;
  submitLabel: string;
  clients?: string[];
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [concepto, setConcepto] = useState(values.concepto);
  const [cliente, setCliente] = useState(values.cliente);
  const [fecha, setFecha] = useState(values.fecha);
  const [base, setBase] = useState(values.base);
  const [iva, setIva] = useState(values.iva);
  const [total, setTotal] = useState(values.total);
  const [cobrada, setCobrada] = useState(values.cobrada);

  const [ivaRate, setIvaRate] = useState<number>(() => {
    const r = num(values.iva_rate);
    return Number.isFinite(r) && values.iva_rate.trim() !== "" ? r : 21;
  });

  // Desglose hacia atrás: base e IVA se calculan del total y el tipo.
  function recalc(totalStr: string, rate: number) {
    const t = num(totalStr);
    if (!Number.isFinite(t) || t <= 0) return;
    const b = round2(t / (1 + rate / 100));
    setBase(String(b));
    setIva(String(round2(t - b)));
  }
  function onTotalChange(v: string) {
    setTotal(v);
    recalc(v, ivaRate);
  }
  function onIvaRate(rate: number) {
    setIvaRate(rate);
    recalc(total, rate);
  }

  function save() {
    setError(null);
    const totalNum = num(total);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      setError("Indica el importe del ingreso.");
      return;
    }
    startSave(async () => {
      const payload: IncomePayload = {
        concepto: concepto.trim(),
        cliente: cliente.trim(),
        fecha,
        base: optNum(base),
        iva_rate: optNum(String(ivaRate)),
        iva: optNum(iva),
        total: round2(totalNum),
        cobrada,
        notas: "",
      };
      const res = await action(payload);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const inputSm =
    "w-full rounded-xl border-[1.5px] border-line bg-panel px-3.5 py-3 text-base font-semibold text-text outline-none focus:border-amber";

  return (
    <div className="stagger pb-4">
      <Field label="Concepto" htmlFor="concepto" hint="De qué es el ingreso">
        <input id="concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Porte Madrid · cliente directo" className={inputSm} />
      </Field>

      <Field label="Cliente / pagador" htmlFor="cliente" hint="Elige uno de tu cartera o escribe uno nuevo">
        <input
          id="cliente"
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          placeholder="Transportes Ejemplo S.L."
          list="ingreso-clientes"
          autoComplete="off"
          className={inputSm}
        />
        {clients.length > 0 && (
          <datalist id="ingreso-clientes">
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" htmlFor="fecha">
          <input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputSm} />
        </Field>
        <Field label="Total (€)" htmlFor="total">
          <input id="total" type="number" step="0.01" min="0" inputMode="decimal" value={total} onChange={(e) => onTotalChange(e.target.value)} placeholder="500.00" className={`${inputSm} font-display !text-xl`} />
        </Field>
      </div>

      <Field label="IVA" hint="La base y la cuota se calculan del total">
        <div className="flex flex-wrap gap-2">
          {IVA_OPTS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onIvaRate(r)}
              aria-pressed={ivaRate === r}
              className={clsx(
                "rounded-[13px] border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-all",
                ivaRate === r ? "border-amber bg-amber-soft text-amber" : "border-line bg-panel text-text",
              )}
            >
              {r}%
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Base (€)" htmlFor="base" hint="Calculada · editable">
          <input id="base" type="number" step="0.01" min="0" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} placeholder="413.22" className={inputSm} />
        </Field>
        <Field label="IVA (€)" htmlFor="iva" hint="Calculada · editable">
          <input id="iva" type="number" step="0.01" min="0" inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} placeholder="86.78" className={inputSm} />
        </Field>
      </div>

      <Field label="Estado">
        <div className="flex gap-2">
          <button type="button" onClick={() => setCobrada(true)} aria-pressed={cobrada} className={chip(cobrada)}>Cobrado</button>
          <button type="button" onClick={() => setCobrada(false)} aria-pressed={!cobrada} className={chip(!cobrada)}>Pendiente</button>
        </div>
      </Field>

      {error && <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex min-h-[64px] w-full items-center justify-center gap-2.5 rounded-[18px] bg-amber px-5 py-5 text-[17px] font-extrabold text-[#1a1205] shadow-[0_12px_26px_rgba(255,178,62,0.30)] transition-transform active:scale-[0.97] disabled:opacity-60"
      >
        <Icon name="save" size={22} />
        {saving ? "Guardando…" : submitLabel}
      </button>
    </div>
  );
}

function chip(active: boolean): string {
  return clsx(
    "rounded-[13px] border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-all",
    active ? "border-amber bg-amber-soft text-amber" : "border-line bg-panel text-text",
  );
}
