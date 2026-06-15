import { describe, it, expect } from "vitest";
import { quarterOfMonth, isInPeriod } from "@/lib/fiscal";
import {
  periodKpis,
  buckets,
  routeRanking,
  clientRanking,
  bestMonthBeneficio,
  type SInvoice,
  type STrip,
  type SExpense,
} from "@/lib/stats";

const invoices: SInvoice[] = [
  { fecha: "2025-02-10", base: 1000, total: 1200, clientName: "A" },
  { fecha: "2025-05-15", base: 2000, total: 2400, clientName: "B" },
  { fecha: "2025-06-20", base: 500, total: 600, clientName: "A" },
];
const trips: STrip[] = [
  { fecha: "2025-05-15", km: 1000, importe: 2000, ruta: "X → Y", toneladas: 20 },
  { fecha: "2025-06-20", km: 500, importe: 500, ruta: "Z → W", toneladas: 10 },
];
const expenses: SExpense[] = [];

describe("fiscal", () => {
  it("trimestre de un mes", () => {
    expect(quarterOfMonth(0)).toBe(1);
    expect(quarterOfMonth(5)).toBe(2);
    expect(quarterOfMonth(8)).toBe(3);
    expect(quarterOfMonth(11)).toBe(4);
  });
  it("isInPeriod", () => {
    expect(isInPeriod("2025-06-20", 2025, "Y")).toBe(true);
    expect(isInPeriod("2025-06-20", 2025, "2")).toBe(true);
    expect(isInPeriod("2025-06-20", 2025, "1")).toBe(false);
    expect(isInPeriod("2024-06-20", 2025, "Y")).toBe(false);
  });
});

describe("stats · KPIs", () => {
  it("Año completo", () => {
    const k = periodKpis(invoices, trips, expenses, 2025, "Y");
    expect(k.ingresos).toBe(3500);
    expect(k.gastos).toBe(0);
    expect(k.beneficio).toBe(3500);
    expect(k.km).toBe(1500);
    expect(k.eurKm).toBeCloseTo(2.3333, 3);
    expect(k.nFacturas).toBe(3);
    expect(k.margen).toBe(1);
  });
  it("T2", () => {
    const k = periodKpis(invoices, trips, expenses, 2025, "2");
    expect(k.ingresos).toBe(2500);
    expect(k.nFacturas).toBe(2);
    expect(k.eurKm).toBeCloseTo(1.6667, 3);
  });
  it("T1 sin viajes → €/km null", () => {
    const k = periodKpis(invoices, trips, expenses, 2025, "1");
    expect(k.ingresos).toBe(1000);
    expect(k.km).toBe(0);
    expect(k.eurKm).toBeNull();
    expect(k.eurKmCombustible).toBeNull();
  });

  it("€/km de combustible por periodo (gasto Gasoil / km)", () => {
    const exp: SExpense[] = [
      { fecha: "2025-05-10", categoria: "Gasoil", total: 1500 },
      { fecha: "2025-05-20", categoria: "Peaje", total: 100 },
    ];
    // T2: km = 1000 + 500 = 1500; combustible (solo Gasoil) = 1500 → 1,00 €/km
    const k = periodKpis(invoices, trips, exp, 2025, "2");
    expect(k.gastoCombustible).toBe(1500);
    expect(k.eurKmCombustible).toBeCloseTo(1.0, 3);
    expect(k.beneficioKm).toBeCloseTo((2500 - 1600) / 1500, 4);
  });

  it("t·km y €/t·km por periodo", () => {
    // T2: 1000 km · 20 t + 500 km · 10 t = 25.000 t·km; ingresos 2500 → 0,1 €/t·km
    const k = periodKpis(invoices, trips, expenses, 2025, "2");
    expect(k.tkm).toBe(25000);
    expect(k.eurTkm).toBeCloseTo(0.1, 4);
  });
});

describe("stats · buckets y rankings", () => {
  it("buckets del año son los 4 trimestres", () => {
    const b = buckets(invoices, expenses, 2025, "Y");
    expect(b.map((x) => x.label)).toEqual(["T1", "T2", "T3", "T4"]);
    expect(b[0].ingresos).toBe(1000);
    expect(b[1].ingresos).toBe(2500);
    expect(b[3].ingresos).toBe(0);
  });
  it("ranking de clientes por base imponible (coherente con ingresos)", () => {
    const r = clientRanking(invoices, 2025, "Y");
    expect(r[0]).toEqual({ name: "B", total: 2000, nFacturas: 1 });
    expect(r[1]).toEqual({ name: "A", total: 1500, nFacturas: 2 });
  });
  it("ranking de rutas con €/km", () => {
    const r = routeRanking(trips, 2025, "2");
    expect(r[0].ruta).toBe("X → Y");
    expect(r[0].eurKm).toBeCloseTo(2.0, 3);
  });
  it("mejor mes (referencia del medidor)", () => {
    expect(bestMonthBeneficio(invoices, expenses, 2025)).toBe(2000);
    expect(bestMonthBeneficio([], [], 2025)).toBe(0);
  });
});
