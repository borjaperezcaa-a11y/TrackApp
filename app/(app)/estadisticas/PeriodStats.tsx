"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { eur } from "@/lib/format";
import { type Period, periodLabel, quarterOfMonth } from "@/lib/fiscal";
import {
  periodKpis,
  buckets,
  categoryBreakdown,
  routeRanking,
  clientRanking,
  vehicleStats,
  type SInvoice,
  type STrip,
  type SExpense,
  type SViaje,
} from "@/lib/stats";
import { BarChart } from "@/components/charts/BarChart";
import { Donut } from "@/components/charts/Donut";
import { Ranking } from "@/components/charts/Ranking";
import { InfoHint } from "@/components/ui/InfoHint";

// Explicaciones en lenguaje llano para los iconos ⓘ de cada KPI.
const INFO = {
  ingresos: "Lo que facturas sin el IVA (la base imponible). Es tu dinero real; el IVA solo está de paso.",
  gastos: "Todo lo que registras como gasto del periodo: gasoil, peajes, taller, dietas, etc.",
  beneficio: "Ingresos menos gastos. Lo que te queda antes de pagar impuestos.",
  margen: "Qué porcentaje de tus ingresos es beneficio. 82 % significa que de cada 100 € te quedan 82.",
  eurKm: "Cuánto ingresas por cada kilómetro recorrido en el periodo. Es tu precio medio del km.",
  facturas: "Número de facturas emitidas en el periodo. Los ingresos manuales no cuentan aquí.",
  gastoKm: "Lo que te cuesta cada kilómetro: todos los gastos del periodo divididos entre los km.",
  gasoilKm: "Solo el gasoil por kilómetro. El mejor indicador para vigilar el consumo de combustible.",
  beneficioKm: "Lo que ganas limpio por kilómetro. Si sale en rojo, ese periodo das pérdidas por km.",
  ivaRepercutido:
    "El IVA que cobras a tus clientes en tus facturas. No es tuyo: se lo debes a Hacienda. Va en el modelo 303. Lo calcula la app al emitir cada factura, así que es fiable.",
  ivaSoportado:
    "El IVA que tú pagas en tus gastos. Hacienda te lo descuenta del IVA que debes. Va en el modelo 303. Sale del IVA que apuntas en cada gasto.",
  ivaLiquidar:
    "IVA repercutido menos IVA soportado. Si es positivo, es lo que ingresas a Hacienda cada trimestre (modelo 303); si es negativo, queda a tu favor (a compensar en el siguiente).",
  irpf: "El IRPF que tus clientes ya te han retenido en las facturas. Es un adelanto de tu declaración de la renta (modelo 130). No tienes que volver a pagarlo.",
} as const;

// Trimestres primero y "Año" al final; por defecto se abre en el trimestre actual.
const PERIODS: Period[] = ["1", "2", "3", "4", "Y"];

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
  viajes,
  vehiculos = [],
  expenses,
  years,
  defaultYear,
}: {
  invoices: SInvoice[];
  trips: STrip[]; // portes (para rankings de rutas por importe)
  viajes: SViaje[]; // viajes físicos (para los km, contados una vez)
  vehiculos?: { id: string; nombre: string }[];
  expenses: SExpense[];
  years: number[];
  defaultYear: number;
}) {
  const [year, setYear] = useState(defaultYear);
  // Por defecto, el trimestre en el que estamos (T1–T4 según el mes actual).
  const [period, setPeriod] = useState<Period>(() => String(quarterOfMonth(new Date().getMonth())) as Period);

  // Memoizados: solo se recalculan al cambiar año/periodo (o los datos), no en
  // cada render. Mantiene la pantalla fluida en móviles con muchos registros.
  const k = useMemo(
    () => periodKpis(invoices, viajes, expenses, year, period),
    [invoices, viajes, expenses, year, period],
  );
  const bkts = useMemo(() => buckets(invoices, expenses, year, period), [invoices, expenses, year, period]);
  const cats = useMemo(
    () =>
      categoryBreakdown(expenses, year, period).map((c) => ({
        label: c.categoria,
        value: c.total,
        pct: c.pct,
        color: CATEGORY_COLORS[c.categoria] ?? "var(--dim)",
      })),
    [expenses, year, period],
  );
  const routes = useMemo(() => routeRanking(trips, year, period), [trips, year, period]);
  const clients = useMemo(() => clientRanking(invoices, year, period), [invoices, year, period]);
  // Solo tiene sentido desglosar por camión si hay 2 o más; con uno (o ninguno),
  // los totales de arriba ya son de ese camión.
  const vehs = useMemo(
    () => (vehiculos.length >= 2 ? vehicleStats(viajes, trips, vehiculos, year, period) : []),
    [viajes, trips, vehiculos, year, period],
  );
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
        <Kpi label="Ingresos" value={eur(k.ingresos)} color="var(--green)" info={INFO.ingresos} />
        <Kpi label="Gastos" value={eur(k.gastos)} color="var(--amber)" info={INFO.gastos} />
        <Kpi
          label="Beneficio"
          value={eur(k.beneficio)}
          color={k.beneficio >= 0 ? "var(--green)" : "var(--red)"}
          info={INFO.beneficio}
        />
        <Kpi label="Margen" value={`${Math.round(k.margen * 100)}%`} info={INFO.margen} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Kpi
          label="€/km (ingresos)"
          value={k.eurKm != null ? `${k.eurKm.toFixed(2).replace(".", ",")} €/km` : "—"}
          info={INFO.eurKm}
        />
        <Kpi label="Facturas" value={String(k.nFacturas)} info={INFO.facturas} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Kpi
          label="Gasto /km"
          value={k.gastoKm != null ? `${k.gastoKm.toFixed(2).replace(".", ",")} €` : "—"}
          color="var(--amber)"
          info={INFO.gastoKm}
        />
        <Kpi
          label="Gasoil /km"
          value={k.eurKmCombustible != null ? `${k.eurKmCombustible.toFixed(2).replace(".", ",")} €` : "—"}
          color="var(--amber)"
          info={INFO.gasoilKm}
        />
        <Kpi
          label="Beneficio /km"
          value={k.beneficioKm != null ? `${k.beneficioKm.toFixed(2).replace(".", ",")} €` : "—"}
          color={k.beneficioKm != null && k.beneficioKm < 0 ? "var(--red)" : "var(--green)"}
          info={INFO.beneficioKm}
        />
      </div>

      {/* Resumen fiscal del periodo */}
      <SectionLabel>Resumen fiscal {periodLabel(period).toLowerCase()}</SectionLabel>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="IVA repercutido" value={eur(k.ivaRepercutido)} info={INFO.ivaRepercutido} />
        <Kpi label="IVA soportado" value={eur(k.ivaSoportado)} info={INFO.ivaSoportado} />
        <Kpi
          label={k.ivaLiquidar >= 0 ? "IVA a ingresar" : "IVA a tu favor"}
          value={eur(Math.abs(k.ivaLiquidar))}
          color={k.ivaLiquidar > 0 ? "var(--red)" : "var(--green)"}
          info={INFO.ivaLiquidar}
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3">
        <Kpi label="IRPF retenido por tus clientes" value={eur(k.irpfRetenido)} info={INFO.irpf} />
      </div>
      <p className="mx-1 mt-2 text-[11.5px] leading-snug text-dim">
        Estimación orientativa para tus modelos 303 (IVA) y 130 (IRPF). El IVA a ingresar es el repercutido en tus
        facturas menos el soportado en tus gastos. No sustituye a tu asesoría.
      </p>

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
              sub: `${eur(r.total)} cobrado`,
              value: r.eurKm != null ? `${r.eurKm.toFixed(2).replace(".", ",")} €/km` : "—",
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

      {vehs.length > 0 && (
        <>
          <SectionLabel>Por camión</SectionLabel>
          <Ranking
            items={vehs.map((v) => ({
              title: v.nombre,
              sub: `${eur(v.ingresos)} · ${Math.round(v.km).toLocaleString("es-ES")} km · ${v.nViajes} ${v.nViajes === 1 ? "viaje" : "viajes"}`,
              value: v.eurKm != null ? `${v.eurKm.toFixed(2).replace(".", ",")} €/km` : "—",
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

function Kpi({ label, value, color, info }: { label: string; value: string; color?: string; info?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3.5">
      <div className="flex items-start justify-between gap-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-dim">{label}</div>
        {info && <InfoHint title={label}>{info}</InfoHint>}
      </div>
      <div className="mt-1.5 font-display text-[28px] font-bold leading-none tnum" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mx-1 mb-2.5 mt-[18px] text-xs font-bold uppercase tracking-[0.16em] text-dim">{children}</div>;
}
