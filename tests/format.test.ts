import { describe, it, expect } from "vitest";
import { eur, amount, round2, dateES, parseDecimal, num, dmyToISO } from "@/lib/format";

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

  it("dateES: estable sin desplazar el día por zona horaria", () => {
    // Una fecha de Postgres "YYYY-MM-DD" debe verse igual sea cual sea la TZ del
    // runtime (antes, new Date('2025-01-01') en UTC podía mostrar 31/12/2024).
    expect(dateES("2025-01-01")).toBe("01/01/2025");
    expect(dateES("2025-12-31")).toBe("31/12/2025");
    // Tolera un timestamp completo usando solo la parte de fecha.
    expect(dateES("2025-03-31T23:30:00Z")).toBe("31/03/2025");
    // Entrada inválida → cadena vacía, no "Invalid Date".
    expect(dateES("no-es-fecha")).toBe("");
  });

  it("dmyToISO: DD/MM/AAAA → ISO, rechaza fechas imposibles", () => {
    expect(dmyToISO("31/03/2025")).toBe("2025-03-31");
    expect(dmyToISO("1/1/2025")).toBe("2025-01-01");
    expect(dmyToISO("31/02/2025")).toBe(""); // febrero no tiene 31
    expect(dmyToISO("00/01/2025")).toBe("");
    expect(dmyToISO("12/13/2025")).toBe(""); // mes 13
    expect(dmyToISO("31/03")).toBe(""); // incompleta
    expect(dmyToISO("")).toBe("");
  });

  it("num: convierte a número seguro (nunca NaN)", () => {
    expect(num("1240.5")).toBe(1240.5);
    expect(num(87.4)).toBe(87.4);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("texto")).toBe(0);
    expect(num(NaN)).toBe(0);
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
