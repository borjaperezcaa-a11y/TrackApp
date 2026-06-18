import { describe, it, expect } from "vitest";
import {
  buildRegistroAltaXml,
  buildRegistroAnulacionXml,
  wrapEnvelope,
  type SistemaInformatico,
} from "./registro";
import { computeHuella, computeHuellaAnulacion } from "../huella";

const SIS: SistemaInformatico = {
  nombreRazon: "Borja Pérez",
  nif: "12345678Z",
  nombreSistema: "TrackApp",
  idSistema: "TA",
  version: "1.0.0",
  numeroInstalacion: "1",
  soloVerifactu: "S",
  multiOT: "N",
  indicadorMultiplesOT: "N",
};

// Comprobador de buena formación: apila aperturas y casa cierres (nuestro XML no
// tiene tags autocerrados ni comentarios/CDATA).
function isWellFormed(xml: string): boolean {
  const body = xml.replace(/<\?xml[^>]*\?>/g, "");
  const tags = body.match(/<\/?[^>]+>/g) ?? [];
  const stack: string[] = [];
  for (const tag of tags) {
    if (tag.startsWith("</")) {
      if (stack.pop() !== tag.slice(2, -1).trim()) return false;
    } else {
      stack.push(tag.slice(1, -1).trim().split(/\s/)[0]);
    }
  }
  return stack.length === 0;
}

const baseAlta = {
  emisorNif: "89890001K",
  emisorNombre: "Paloma Pérez",
  numero: "FACT/26-01",
  fechaExpedicion: "2026-06-18",
  tipoFactura: "F1",
  descripcion: "Transporte de mercancías",
  desglose: [
    { impuesto: "01", claveRegimen: "01", calificacionOperacion: "S1", tipoImpositivo: 21, baseImponible: 1000, cuotaRepercutida: 210 },
  ],
  cuotaTotal: 210,
  importeTotal: 1210, // base + IVA (SIN restar IRPF)
  sistema: SIS,
  genTs: "2026-06-18T10:00:00+02:00",
};

describe("XML RegistroAlta", () => {
  it("genera un registro con los campos obligatorios y huella coherente", async () => {
    const { xml, huella } = await buildRegistroAltaXml({ ...baseAlta, anterior: null });

    expect(xml).toContain("<sf:IDVersion>1.0</sf:IDVersion>");
    expect(xml).toContain("<sf:TipoFactura>F1</sf:TipoFactura>");
    expect(xml).toContain("<sf:IdSistemaInformatico>TA</sf:IdSistemaInformatico>");
    expect(xml).toContain("<sf:TipoHuella>01</sf:TipoHuella>");
    expect(xml).toContain("<sf:FechaExpedicionFactura>18-06-2026</sf:FechaExpedicionFactura>");
    // Primer registro de la cadena.
    expect(xml).toContain("<sf:PrimerRegistro>S</sf:PrimerRegistro>");
    // El instante del XML es idéntico al que entra en la huella.
    expect(xml).toContain("<sf:FechaHoraHusoGenRegistro>2026-06-18T10:00:00+02:00</sf:FechaHoraHusoGenRegistro>");

    // La huella del XML coincide con la del motor validado.
    expect(xml).toContain(`<sf:Huella>${huella}</sf:Huella>`);
    expect(huella).toBe(
      await computeHuella({
        emisorNif: baseAlta.emisorNif,
        numero: baseAlta.numero,
        fechaExpedicion: baseAlta.fechaExpedicion,
        tipoFactura: "F1",
        cuotaTotal: 210,
        importeTotal: 1210,
        huellaAnterior: null,
        genTs: baseAlta.genTs,
      }),
    );

    // Bien formado dentro de su envoltorio.
    expect(isWellFormed(wrapEnvelope({ nombreRazon: "Paloma Pérez", nif: "89890001K" }, [xml]))).toBe(true);
  });

  it("ImporteTotal = base + IVA, sin restar IRPF (FAQ AEAT nº20)", async () => {
    const { xml } = await buildRegistroAltaXml({ ...baseAlta, anterior: null });
    expect(xml).toContain("<sf:ImporteTotal>1210.00</sf:ImporteTotal>");
    expect(xml).toContain("<sf:CuotaTotal>210.00</sf:CuotaTotal>");
    // NO debe aparecer el total con IRPF restado (1210 − 1% = 1197.90, p. ej.).
    expect(xml).not.toContain("1197.90");
  });

  it("encadena con el registro anterior cuando se aporta", async () => {
    const prev = { emisorNif: "89890001K", numero: "FACT/25-99", fechaExpedicion: "2025-12-31", huella: "A".repeat(64) };
    const { xml } = await buildRegistroAltaXml({ ...baseAlta, anterior: prev });
    expect(xml).toContain("<sf:RegistroAnterior>");
    expect(xml).toContain(`<sf:Huella>${"A".repeat(64)}</sf:Huella>`);
    expect(xml).not.toContain("<sf:PrimerRegistro>");
  });

  it("escapa los caracteres XML en los valores de texto sin afectar a la huella", async () => {
    const { xml, huella } = await buildRegistroAltaXml({ ...baseAlta, numero: "A&B<1>", anterior: null });
    // En el XML va escapado…
    expect(xml).toContain("<sf:NumSerieFactura>A&amp;B&lt;1&gt;</sf:NumSerieFactura>");
    // …pero la huella se calcula sobre el valor lógico (sin escapar).
    expect(huella).toBe(
      await computeHuella({
        emisorNif: baseAlta.emisorNif,
        numero: "A&B<1>",
        fechaExpedicion: baseAlta.fechaExpedicion,
        tipoFactura: "F1",
        cuotaTotal: 210,
        importeTotal: 1210,
        huellaAnterior: null,
        genTs: baseAlta.genTs,
      }),
    );
    expect(isWellFormed(wrapEnvelope({ nombreRazon: "X", nif: "89890001K" }, [xml]))).toBe(true);
  });
});

describe("XML RegistroAnulacion", () => {
  it("usa los campos *Anulada y huella coherente", async () => {
    const prev = { emisorNif: "89890001K", numero: "FACT/26-01", fechaExpedicion: "2026-06-18", huella: "B".repeat(64) };
    const { xml, huella } = await buildRegistroAnulacionXml({
      emisorNif: "89890001K",
      numero: "FACT/26-01",
      fechaExpedicion: "2026-06-18",
      anterior: prev,
      sistema: SIS,
      genTs: "2026-06-18T10:05:00+02:00",
    });
    expect(xml).toContain("<sf:IDEmisorFacturaAnulada>89890001K</sf:IDEmisorFacturaAnulada>");
    expect(xml).toContain("<sf:NumSerieFacturaAnulada>FACT/26-01</sf:NumSerieFacturaAnulada>");
    expect(xml).toContain("<sf:FechaExpedicionFacturaAnulada>18-06-2026</sf:FechaExpedicionFacturaAnulada>");
    expect(xml).toContain(`<sf:Huella>${huella}</sf:Huella>`);
    expect(huella).toBe(
      await computeHuellaAnulacion({
        emisorNif: "89890001K",
        numero: "FACT/26-01",
        fechaExpedicion: "2026-06-18",
        huellaAnterior: "B".repeat(64),
        genTs: "2026-06-18T10:05:00+02:00",
      }),
    );
    expect(isWellFormed(wrapEnvelope({ nombreRazon: "X", nif: "89890001K" }, [xml]))).toBe(true);
  });
});

describe("Envoltorio RegFactuSistemaFacturacion", () => {
  it("incluye cabecera, obligado y los registros, y está bien formado", async () => {
    const { xml: alta } = await buildRegistroAltaXml({ ...baseAlta, anterior: null });
    const env = wrapEnvelope({ nombreRazon: "Paloma Pérez", nif: "89890001K" }, [alta]);
    expect(env.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(env).toContain("<sfLR:RegFactuSistemaFacturacion");
    expect(env).toContain("<sf:Cabecera><sf:ObligadoEmision>");
    expect(env).toContain("<sfLR:RegistroFactura>");
    expect(isWellFormed(env)).toBe(true);
  });
});
