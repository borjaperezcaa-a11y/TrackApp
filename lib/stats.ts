/**
 * Agregación de estadísticas (puro, testeable, usable en servidor y cliente).
 * Las métricas fiscales se definen aquí una sola vez:
 *  - ingresos = base imponible de facturas emitidas (el IVA es de paso, no es ingreso)
 *  - gastos   = total de gastos registrados
 *  - beneficio = ingresos − gastos
 *  - margen   = beneficio / ingresos
 *  - €/km     = ingresos / km recorridos
 */
import { isInPeriod, quarterOfMonth, dateParts, MONTH_SHORT, type Period } from "./fiscal";

export type SInvoice = {
  fecha: string;
  base: number;
  total: number;
  clientName: string;
  // IVA repercutido e IRPF retenido (para el resumen fiscal). Opcionales: si no
  // se aportan se asumen 0 (compatibilidad con tests y datos antiguos).
  iva?: number;
  irpf?: number;
  // false = ingreso manual (cuenta como ingreso/€-km pero NO en el nº de facturas).
  esFactura?: boolean;
};
export type STrip = {
  fecha: string;
  km: number | null;
  importe: number;
  ruta: string;
};
// `iva` = IVA soportado (deducible) del gasto. Opcional → 0 si no consta.
export type SExpense = { fecha: string; categoria: string; total: number; iva?: number };

// Viaje FÍSICO para el cálculo de km: los km se cuentan UNA vez por viaje (no por
// porte), así no se duplican cuando un viaje lleva carga para varios clientes.
export type SViaje = { fecha: string; km: number | null };

export type Kpis = {
  ingresos: number;
  gastos: number;
  beneficio: number;
  margen: number; // 0..1
  eurKm: number | null; // ingresos / km
  km: number;
  nFacturas: number;
  // El combustible no se imputa por viaje (un depósito da para varios), pero sí
  // como métrica de periodo:
  gastoCombustible: number; // suma de gastos de categoría Gasoil
  eurKmCombustible: number | null; // gasto combustible / km
  beneficioKm: number | null; // beneficio / km
  gastoKm: number | null; // TODOS los gastos / km
  // ── Resumen fiscal del periodo (orientativo, modelos 303 / 130) ──
  ivaRepercutido: number; // IVA cobrado en facturas/ingresos
  ivaSoportado: number; // IVA deducible de los gastos
  ivaLiquidar: number; // repercutido − soportado (a ingresar si > 0)
  irpfRetenido: number; // IRPF retenido por tus clientes
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function periodKpis(
  invoices: SInvoice[],
  // Fuente de km = VIAJES físicos (una vez por viaje). STrip[] también encaja por
  // estructura (tiene fecha+km), de modo que los tests siguen valiendo.
  viajes: SViaje[],
  expenses: SExpense[],
  year: number,
  period: Period,
): Kpis {
  const inv = invoices.filter((i) => isInPeriod(i.fecha, year, period));
  const vj = viajes.filter((v) => isInPeriod(v.fecha, year, period));
  const ex = expenses.filter((e) => isInPeriod(e.fecha, year, period));

  const ingresos = sum(inv.map((i) => i.base));
  const gastos = sum(ex.map((e) => e.total));
  const km = sum(vj.map((v) => v.km ?? 0));
  const beneficio = ingresos - gastos;
  const gastoCombustible = sum(ex.filter((e) => e.categoria === "Gasoil").map((e) => e.total));
  const ivaRepercutido = sum(inv.map((i) => i.iva ?? 0));
  // Salvaguarda de datos: el IVA de un gasto no puede ser negativo ni superar su
  // total (un escaneo erróneo puede meter un importe absurdo en la casilla IVA).
  // Esas filas no se suman, para no inflar el "IVA soportado".
  const ivaSoportado = sum(
    ex.map((e) => {
      const iva = e.iva ?? 0;
      return iva > 0 && iva <= e.total ? iva : 0;
    }),
  );
  const irpfRetenido = sum(inv.map((i) => i.irpf ?? 0));

  return {
    ingresos,
    gastos,
    beneficio,
    margen: ingresos > 0 ? beneficio / ingresos : 0,
    eurKm: km > 0 ? ingresos / km : null,
    km,
    // Solo cuentan como "factura" las que lo son (excluye ingresos manuales).
    nFacturas: inv.filter((i) => i.esFactura !== false).length,
    gastoCombustible,
    eurKmCombustible: km > 0 ? gastoCombustible / km : null,
    beneficioKm: km > 0 ? beneficio / km : null,
    gastoKm: km > 0 ? gastos / km : null,
    ivaRepercutido,
    ivaSoportado,
    ivaLiquidar: ivaRepercutido - ivaSoportado,
    irpfRetenido,
  };
}

export type Bucket = { label: string; ingresos: number; gastos: number };

/** Para "Año": 4 trimestres. Para un trimestre: sus 3 meses. */
export function buckets(
  invoices: SInvoice[],
  expenses: SExpense[],
  year: number,
  period: Period,
): Bucket[] {
  if (period === "Y") {
    return [1, 2, 3, 4].map((q) => {
      const p = String(q) as Period;
      return {
        label: `T${q}`,
        ingresos: sum(invoices.filter((i) => isInPeriod(i.fecha, year, p)).map((i) => i.base)),
        gastos: sum(expenses.filter((e) => isInPeriod(e.fecha, year, p)).map((e) => e.total)),
      };
    });
  }
  const months = [0, 1, 2].map((k) => (Number(period) - 1) * 3 + k);
  return months.map((m0) => ({
    label: MONTH_SHORT[m0],
    ingresos: sum(
      invoices.filter((i) => dateParts(i.fecha).year === year && dateParts(i.fecha).month0 === m0).map((i) => i.base),
    ),
    gastos: sum(
      expenses.filter((e) => dateParts(e.fecha).year === year && dateParts(e.fecha).month0 === m0).map((e) => e.total),
    ),
  }));
}

export type CategorySlice = { categoria: string; total: number; pct: number };

export function categoryBreakdown(
  expenses: SExpense[],
  year: number,
  period: Period,
): CategorySlice[] {
  const ex = expenses.filter((e) => isInPeriod(e.fecha, year, period));
  const total = sum(ex.map((e) => e.total));
  if (total <= 0) return [];
  const byCat = new Map<string, number>();
  for (const e of ex) byCat.set(e.categoria || "Otro", (byCat.get(e.categoria || "Otro") ?? 0) + e.total);
  return [...byCat.entries()]
    .map(([categoria, t]) => ({ categoria, total: t, pct: Math.max(0, t / total) }))
    .sort((a, b) => b.total - a.total);
}

export type RouteRank = { ruta: string; total: number; eurKm: number | null };

export function routeRanking(
  trips: STrip[],
  year: number,
  period: Period,
  topN = 3,
): RouteRank[] {
  const tr = trips.filter((t) => isInPeriod(t.fecha, year, period) && t.ruta.trim() !== "");
  const agg = new Map<string, { total: number; km: number }>();
  for (const t of tr) {
    const a = agg.get(t.ruta) ?? { total: 0, km: 0 };
    a.total += t.importe;
    a.km += t.km ?? 0;
    agg.set(t.ruta, a);
  }
  return [...agg.entries()]
    .map(([ruta, a]) => ({ ruta, total: a.total, eurKm: a.km > 0 ? a.total / a.km : null }))
    // Mejores rutas por rentabilidad: €/km descendente (las sin km, al final).
    .sort((x, y) => (y.eurKm ?? -Infinity) - (x.eurKm ?? -Infinity))
    .slice(0, topN);
}

export type ClientRank = { name: string; total: number; nFacturas: number };

export function clientRanking(
  invoices: SInvoice[],
  year: number,
  period: Period,
  topN = 3,
): ClientRank[] {
  const inv = invoices.filter((i) => isInPeriod(i.fecha, year, period));
  const agg = new Map<string, { total: number; n: number }>();
  for (const i of inv) {
    const name = i.clientName || "Cliente";
    const a = agg.get(name) ?? { total: 0, n: 0 };
    // Base imponible (no el total con IVA): coherente con el KPI "Ingresos".
    a.total += i.base;
    a.n += 1;
    agg.set(name, a);
  }
  return [...agg.entries()]
    .map(([name, a]) => ({ name, total: a.total, nFacturas: a.n }))
    .sort((x, y) => y.total - x.total)
    .slice(0, topN);
}

export type MonthPoint = { month0: number; ingresos: number; gastos: number; beneficio: number };

/** Serie de los 12 meses del año (para mini-gráfica y mejor mes). */
export function monthlySeries(
  invoices: SInvoice[],
  expenses: SExpense[],
  year: number,
): MonthPoint[] {
  return Array.from({ length: 12 }, (_, m0) => {
    const ingresos = sum(
      invoices.filter((i) => dateParts(i.fecha).year === year && dateParts(i.fecha).month0 === m0).map((i) => i.base),
    );
    const gastos = sum(
      expenses.filter((e) => dateParts(e.fecha).year === year && dateParts(e.fecha).month0 === m0).map((e) => e.total),
    );
    return { month0: m0, ingresos, gastos, beneficio: ingresos - gastos };
  });
}

/** Mejor beneficio mensual del año (referencia del medidor). 0 si no hay datos. */
export function bestMonthBeneficio(
  invoices: SInvoice[],
  expenses: SExpense[],
  year: number,
): number {
  return Math.max(0, ...monthlySeries(invoices, expenses, year).map((m) => m.beneficio));
}

export { quarterOfMonth };
