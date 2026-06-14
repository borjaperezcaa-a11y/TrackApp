"use client";

import { useState } from "react";
import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { eur } from "@/lib/format";
import { type Period, periodLabel } from "@/lib/fiscal";
import {
  periodKpis,
  buckets,
  categoryBreakdown,
  routeRanking,
  clientRanking,
  type SInvoice,
  type STrip,
  type SExpense,
} from "@/lib/stats";
import { BarChart } from "@/components/charts/BarChart";
import { Donut } from "@/components/charts/Donut";
import { Ranking } from "@/components/charts/Ranking";

const PERIODS: Period[] = ["Y", "1", "2", "3", "4"];

const CATEGORY_COLORS: Record<string, string> = {
  Gasoil: "var(--amber)",
  Dieta: "var(--purple)",
  Peaje: "var(--blue)",
  Taller: "var(--red)",
  AdBlue: "var(--green)",
  Parking: "var(--yellow)",
  Otro: "var(--dim)",
};

export function PeriodStats({
  invoices,
  trips,
  expenses,
  years,
  defaultYear,
}: {
  invoices: SInvoice[];
  trips: STrip[];
  expenses: SExpense[];
  years: number[];
  defaultYear: number;
}) {
  const [year, setYear] = useState(defaultYear);
  const [period, setPeriod] = useState<Period>("Y");

  const k = periodKpis(invoices, trips, expenses, year, period);
  const bkts = buckets(invoices, expenses, year, period);
  const cats = categoryBreakdown(expenses, year, period).map((c) => ({
    label: c.categoria,
    value: c.total,
    pct: c.pct,
    color: CATEGORY_COLORS[c.categoria] ?? "var(--dim)",
  }));
  const routes = routeRanking(trips, year, period);
  const clients = clientRanking(invoices, year, period);
  const hasGastos = k.gastos > 0;

  return (
    <div className="stagger">
      {years.length > 1 && (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {years.map((y) => (
            <Chip key={y} active={y === year} onClick={() => setYear(y)}>
              {y}
            </Chip>
          ))}
        </div>
      )}

      <div className="mb-3.5 flex flex-wrap gap-2" role="tablist" aria-label="Periodo fiscal">
        {PERIODS.map((p) => (
          <Chip key={p} active={p === period} onClick={() => setPeriod(p)}>
            {periodLabel(p)}
          </Chip>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Ingresos" value={eur(k.ingresos)} color="var(--green)" />
        <Kpi label="Gastos" value={eur(k.gastos)} color="var(--amber)" />
        <Kpi label="Beneficio" value={eur(k.beneficio)} color={k.beneficio >= 0 ? "var(--green)" : "var(--red)"} />
        <Kpi label="Margen" value={`${Math.round(k.margen * 100)}%`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Kpi label="€/km" value={k.eurKm != null ? `${k.eurKm.toFixed(2).replace(".", ",")} €/km` : "—"} />
        <Kpi label="Facturas" value={String(k.nFacturas)} />
      </div>

      {/* Ingresos vs gastos */}
      <SectionLabel>Ingresos vs gastos</SectionLabel>
      <div className="rounded-[20px] border border-line bg-panel p-[18px] shadow-[var(--shadow)]">
        <BarChart data={bkts} showGastos={hasGastos} />
      </div>

      {/* Gastos por categoría */}
      <SectionLabel>Gastos por categoría</SectionLabel>
      {cats.length > 0 ? (
        <div className="rounded-[20px] border border-line bg-panel p-[18px] shadow-[var(--shadow)]">
          <Donut slices={cats} total={k.gastos} />
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-line bg-panel p-6 text-center">
          <p className="text-[14px] font-semibold">Aún no registras gastos</p>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[12.5px] text-dim">
            Escanéalos con una foto y la IA los registra sola. Así verás tu margen real y el €/km.
          </p>
          <Link href="/gastos" className="mt-4 inline-flex rounded-2xl bg-amber px-5 py-2.5 text-[13px] font-extrabold text-[#1a1205]">
            Escanear un gasto
          </Link>
        </div>
      )}

      {/* Rankings */}
      {routes.length > 0 && (
        <>
          <SectionLabel>Mejores rutas</SectionLabel>
          <Ranking
            items={routes.map((r) => ({
              title: r.ruta,
              sub: r.eurKm != null ? `${r.eurKm.toFixed(2).replace(".", ",")} €/km` : undefined,
              value: eur(r.total),
            }))}
          />
        </>
      )}
      {clients.length > 0 && (
        <>
          <SectionLabel>Mejores clientes</SectionLabel>
          <Ranking
            items={clients.map((c) => ({
              title: c.name,
              sub: `${c.nFacturas} ${c.nFacturas === 1 ? "factura" : "facturas"}`,
              value: eur(c.total),
            }))}
          />
        </>
      )}

      {invoices.length === 0 && trips.length === 0 && (
        <p className="mt-8 text-center text-[13px] text-dim">
          Cuando emitas facturas y registres viajes, aquí verás tu rentabilidad.
        </p>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "rounded-[13px] border-[1.5px] px-4 py-2.5 text-sm font-bold transition-all",
        active ? "border-amber bg-amber-soft text-amber" : "border-line bg-panel text-text",
      )}
    >
      {children}
    </button>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-dim">{label}</div>
      <div className="mt-1.5 font-display text-[28px] font-bold leading-none tnum" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mx-1 mb-2.5 mt-[18px] text-xs font-bold uppercase tracking-[0.16em] text-dim">{children}</div>;
}
