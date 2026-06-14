import { describe, it, expect } from "vitest";
import { computeInvoiceTotals } from "@/lib/invoice";

describe("computeInvoiceTotals (≡ round() de Postgres)", () => {
  it("reproduce los totales de la factura de referencia FACT/25-04", () => {
    // 11 portes que suman 8.950,00 €
    const precios = [1000, 350, 400, 400, 1400, 2600, 350, 650, 300, 350, 1150];
    const lines = precios.map((p) => ({ cantidad: 1, precio: p }));
    const t = computeInvoiceTotals(lines, 21, 1);
    expect(t.base).toBe(8950);
    expect(t.iva).toBe(1879.5);
    expect(t.irpf).toBe(89.5);
    expect(t.total).toBe(10740);
  });

  it("redondea a céntimo de forma exacta (sin error de coma flotante)", () => {
    // base 33,33 ; IVA 21% = 6,9993 -> 7,00 ; IRPF 1% = 0,3333 -> 0,33
    const t = computeInvoiceTotals([{ cantidad: 1, precio: 33.33 }], 21, 1);
    expect(t.base).toBe(33.33);
    expect(t.iva).toBe(7.0);
    expect(t.irpf).toBe(0.33);
    expect(t.total).toBe(40.0);
  });

  it("cantidad y precio con decimales", () => {
    const t = computeInvoiceTotals([{ cantidad: 2.5, precio: 10.1 }], 10, 0);
    expect(t.lineImportes[0]).toBe(25.25);
    expect(t.base).toBe(25.25);
    expect(t.iva).toBe(2.53); // 2,525 -> 2,53 (medio hacia arriba)
    expect(t.irpf).toBe(0);
    expect(t.total).toBe(27.78);
  });

  it("varias líneas con céntimos: base = round(suma de productos)", () => {
    const t = computeInvoiceTotals(
      [
        { cantidad: 1, precio: 10.1 },
        { cantidad: 1, precio: 20.2 },
        { cantidad: 1, precio: 0.05 },
      ],
      21,
      1,
    );
    expect(t.base).toBe(30.35);
    expect(t.iva).toBe(6.37); // 30,35*21% = 6,3735 -> 6,37
    expect(t.irpf).toBe(0.3); // 0,3035 -> 0,30
    expect(t.total).toBe(36.42);
  });
});
