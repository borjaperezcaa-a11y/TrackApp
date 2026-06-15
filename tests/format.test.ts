import { describe, it, expect } from "vitest";
import { eur, amount, round2, dateES, parseDecimal } from "@/lib/format";

describe("format es-ES", () => {
  it("formatea euros con coma decimal y punto de millar", () => {
    expect(eur(1500.4)).toBe("1.500,40 €");
    expect(eur(10740)).toBe("10.740,00 €"); // total de la factura de referencia
  });

  it("amount sin símbolo, 2 decimales", () => {
    expect(amount(8950)).toBe("8.950,00");
  });

  it("round2 redondea a céntimo", () => {
    expect(round2(8950 * 0.21)).toBe(1879.5);
    expect(round2(0.005)).toBe(0.01);
  });

  it("dateES en dd/mm/aaaa", () => {
    expect(dateES("2025-03-31")).toBe("31/03/2025");
  });

  it("parseDecimal: decimales de un input type=number (punto)", () => {
    // El bug histórico convertía 87.40 en 8740: estos deben quedar exactos.
    expect(parseDecimal("87.40")).toBe(87.4);
    expect(parseDecimal("1500.00")).toBe(1500);
    expect(parseDecimal("0.04")).toBe(0.04);
    expect(parseDecimal("1240")).toBe(1240);
  });

  it("parseDecimal: formato español tecleado (coma decimal)", () => {
    expect(parseDecimal("1240,50")).toBe(1240.5);
    expect(parseDecimal("1.240,50")).toBe(1240.5);
  });

  it("parseDecimal: vacío → NaN", () => {
    expect(Number.isNaN(parseDecimal(""))).toBe(true);
    expect(Number.isNaN(parseDecimal("   "))).toBe(true);
  });
});
