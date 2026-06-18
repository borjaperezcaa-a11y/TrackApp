/**
 * TEST DE ORO — conformidad de la huella con los ejemplos OFICIALES de la AEAT.
 *
 * Fuente: "Detalle de las especificaciones técnicas para la generación de la
 * huella o hash de los registros de facturación", AEAT, versión 0.1.2
 * (27/08/2024), sección 6 «Ejemplos». Valores copiados literalmente del PDF.
 * Ver lib/verifactu/spec/huella-v0.1.2-ejemplos.md.
 *
 * Si este test falla, NUESTRA huella NO coincide con la que recalcularía la AEAT
 * → el registro saldría "Aceptado con errores". NO TOCAR los valores esperados:
 * son la referencia oficial; lo que debe ajustarse es el motor (canonical/huella).
 */
import { describe, it, expect } from "vitest";
import { buildCanonical, buildCanonicalAnulacion } from "./canonical";
import { computeHuella, computeHuellaAnulacion } from "./huella";

describe("Conformidad con ejemplos oficiales AEAT (huella v0.1.2 §6)", () => {
  it("Caso 1: primer registro de ALTA (sin huella anterior)", async () => {
    const input = {
      emisorNif: "89890001K",
      numero: "12345678/G33",
      fechaExpedicion: "2024-01-01",
      tipoFactura: "F1",
      cuotaTotal: 12.35,
      importeTotal: 123.45,
      huellaAnterior: null,
      genTs: "2024-01-01T19:20:30+01:00",
    };
    expect(buildCanonical(input)).toBe(
      "IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024" +
        "&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=" +
        "&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00",
    );
    expect(await computeHuella(input)).toBe(
      "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60",
    );
  });

  it("Caso 2: ALTA encadenado (con huella anterior)", async () => {
    const input = {
      emisorNif: "89890001K",
      numero: "12345679/G34",
      fechaExpedicion: "2024-01-01",
      tipoFactura: "F1",
      cuotaTotal: 12.35,
      importeTotal: 123.45,
      huellaAnterior: "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60",
      genTs: "2024-01-01T19:20:35+01:00",
    };
    expect(await computeHuella(input)).toBe(
      "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97",
    );
  });

  it("Caso 3: ANULACIÓN encadenada", async () => {
    const input = {
      emisorNif: "89890001K",
      numero: "12345679/G34",
      fechaExpedicion: "2024-01-01",
      huellaAnterior: "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97",
      genTs: "2024-01-01T19:20:40+01:00",
    };
    expect(buildCanonicalAnulacion(input)).toBe(
      "IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345679/G34" +
        "&FechaExpedicionFacturaAnulada=01-01-2024" +
        "&Huella=F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97" +
        "&FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00",
    );
    expect(await computeHuellaAnulacion(input)).toBe(
      "177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68",
    );
  });

  it("trata ImporteTotal 123.1 y 123.10 como equivalentes (spec §3)", () => {
    // La spec dice que los ceros a la derecha no son relevantes; nuestro
    // formatAmount normaliza siempre a 2 decimales, coherente con el ejemplo.
    const base = {
      emisorNif: "89890001K",
      numero: "X",
      fechaExpedicion: "2024-01-01",
      huellaAnterior: null,
      genTs: "2024-01-01T00:00:00+01:00",
    };
    const a = buildCanonical({ ...base, cuotaTotal: 0, importeTotal: 123.1 });
    const b = buildCanonical({ ...base, cuotaTotal: 0, importeTotal: 123.1 });
    expect(a).toBe(b);
    expect(a).toContain("ImporteTotal=123.10");
  });
});
