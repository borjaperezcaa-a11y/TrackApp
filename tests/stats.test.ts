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
  type SViaje,
} from "@/lib/stats";

const invoices: SInvoice[] = [
  { fecha: "2025-02-10", base: 1000, total: 1200, clientName: "A" },
  { fecha: "2025-05-15", base: 2000, total: 2400, clientName: "B" },
  { fecha: "2025-06-20", base: 500, total: 600, clientName: "A" },
];
const trips: STrip[] = [
  { fecha: "2025-05-15", km: 1000, importe: 2000, ruta: "X → Y" },
  { fecha: "2025-06-20", km: 500, importe: 500, ruta: "Z → W" },
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

  it("ingreso manual cuenta en ingresos/€-km pero NO en nº de facturas", () => {
    const conManual: SInvoice[] = [
      ...invoices,
      { fecha: "2025-05-10", base: 500, total: 605, clientName: "Manual", esFactura: false },
    ];
    const k = periodKpis(conManual, trips, expenses, 2025, "2");
    expect(k.ingresos).toBe(3000); // 2500 facturas + 500 manual
    expect(k.nFacturas).toBe(2); // sigue 2: el ingreso manual no cuenta
    expect(k.eurKm).toBeCloseTo(3000 / 1500, 4); // sí entra en €/km
  });

  it("resumen fiscal: IVA a liquidar (repercutido − soportado) e IRPF retenido", () => {
    const inv: SInvoice[] = [
      { fecha: "2025-05-10", base: 1000, iva: 210, irpf: 10, total: 1200, clientName: "A" },
      { fecha: "2025-06-10", base: 2000, iva: 200, irpf: 20, total: 2180, clientName: "B" },
    ];
    const ex: SExpense[] = [
      { fecha: "2025-05-12", categoria: "Gasoil", iva: 100, total: 575 },
      { fecha: "2025-06-01", categoria: "Peaje", iva: 21, total: 121 },
    ];
    const k = periodKpis(inv, trips, ex, 2025, "2");
    expect(k.ivaRepercutido).toBe(410);
    expect(k.ivaSoportado).toBe(121);
    expect(k.ivaLiquidar).toBe(289); // 410 − 121
    expect(k.irpfRetenido).toBe(30);
  });

  it("resumen fiscal: ignora IVA de gasto imposible (iva > total, dato corrupto)", () => {
    const inv: SInvoice[] = [{ fecha: "2025-05-10", base: 1000, iva: 210, irpf: 10, total: 1200, clientName: "A" }];
    const ex: SExpense[] = [
      { fecha: "2025-05-12", categoria: "Gasoil", iva: 100, total: 575 }, // ok → cuenta
      { fecha: "2025-05-13", categoria: "Otro", iva: 9999, total: 50 }, // imposible → se ignora
      { fecha: "2025-05-14", categoria: "Otro", iva: -5, total: 30 }, // negativo → se ignora
    ];
    const k = periodKpis(inv, trips, ex, 2025, "2");
    expect(k.ivaSoportado).toBe(100); // solo el gasto válido
    expect(k.ivaLiquidar).toBe(110); // 210 − 100, sigue saliendo a ingresar
  });

  it("resumen fiscal: sin iva/irpf en los datos → 0 (compatibilidad)", () => {
    const k = periodKpis(invoices, trips, expenses, 2025, "Y");
    expect(k.ivaRepercutido).toBe(0);
    expect(k.ivaSoportado).toBe(0);
    expect(k.ivaLiquidar).toBe(0);
    expect(k.irpfRetenido).toBe(0);
  });

  it("rectificativa de anulación: netea ingresos a 0 y no cuenta como factura", () => {
    const conRect: SInvoice[] = [
      { fecha: "2025-05-10", base: 1000, iva: 210, irpf: 10, total: 1200, clientName: "A" },
      // Anulación (R1): importes en negativo, esFactura=false (no es factura nueva).
      { fecha: "2025-05-20", base: -1000, iva: -210, irpf: -10, total: -1200, clientName: "A", esFactura: false },
    ];
    const k = periodKpis(conRect, trips, expenses, 2025, "2");
    expect(k.ingresos).toBe(0); // 1000 − 1000
    expect(k.ivaRepercutido).toBe(0); // 210 − 210
    expect(k.nFacturas).toBe(1); // solo la original cuenta; la rectificativa no
  });

  it("km salen de los viajes (una vez), no de cada porte", () => {
    // Un viaje de 1000 km aunque lleve carga para varios clientes: km = 1000, no 3000.
    const viajes: SViaje[] = [{ fecha: "2025-05-10", km: 1000 }];
    const inv: SInvoice[] = [{ fecha: "2025-05-10", base: 3000, total: 3630, clientName: "A" }];
    const k = periodKpis(inv, viajes, [], 2025, "2");
    expect(k.km).toBe(1000);
    expect(k.eurKm).toBeCloseTo(3, 4); // 3000 / 1000
  });

  it("gasto /km: todos los gastos del periodo / km del periodo", () => {
    const ex: SExpense[] = [
      { fecha: "2025-05-10", categoria: "Gasoil", total: 600 },
      { fecha: "2025-06-01", categoria: "Peaje", total: 150 },
    ];
    // T2: km = 1000 + 500 = 1500; gastos = 600 + 150 = 750 → 0,50 €/km
    const k = periodKpis(invoices, trips, ex, 2025, "2");
    expect(k.km).toBe(1500);
    expect(k.gastoKm).toBeCloseTo(750 / 1500, 6);
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
