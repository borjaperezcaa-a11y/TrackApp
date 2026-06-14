import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildCanonical,
  buildQr,
  formatAmount,
  dateDMY,
  tsUtcSeconds,
  computeHuella,
  verifyChain,
  type HuellaInput,
  type ChainLink,
} from "./index";

// Vector basado en la factura de referencia FACT/25-04.
const REF: HuellaInput = {
  emisorNif: "45872506H",
  numero: "FACT/25-04",
  fechaExpedicion: "2025-03-31",
  cuotaTotal: 1879.5,
  importeTotal: 10740.0,
  huellaAnterior: null,
  genTs: new Date("2026-06-07T16:03:50Z"),
};

const REF_CANONICAL =
  "IDEmisorFactura=45872506H" +
  "&NumSerieFactura=FACT/25-04" +
  "&FechaExpedicionFactura=31-03-2025" +
  "&TipoFactura=F1" +
  "&CuotaTotal=1879.50" +
  "&ImporteTotal=10740.00" +
  "&Huella=" +
  "&FechaHoraHusoGenRegistro=2026-06-07T16:03:50Z";

/** Hash de referencia por una vía independiente (node:crypto sobre el literal). */
function sha256UpperHex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex").toUpperCase();
}

describe("verifactu · formatAmount (≡ to_char FM9999999990.00)", () => {
  it("2 decimales, punto, sin millares", () => {
    expect(formatAmount(1879.5)).toBe("1879.50");
    expect(formatAmount(10740)).toBe("10740.00");
    expect(formatAmount(89.5)).toBe("89.50");
    expect(formatAmount(0)).toBe("0.00");
    expect(formatAmount(0.1)).toBe("0.10");
    expect(formatAmount(1234567.89)).toBe("1234567.89");
    expect(formatAmount(-89.5)).toBe("-89.50");
  });

  it("inmune a errores de coma flotante", () => {
    expect(formatAmount(8950 * 0.21)).toBe("1879.50"); // 1879.5000000000002
    expect(formatAmount(0.07)).toBe("0.07");
    expect(formatAmount(1.1 * 3)).toBe("3.30"); // 3.3000000000000003
  });
});

describe("verifactu · helpers de fecha/hora", () => {
  it("dateDMY", () => {
    expect(dateDMY("2025-03-31")).toBe("31-03-2025");
    expect(dateDMY("2025-03-03")).toBe("03-03-2025");
    expect(dateDMY("2025-03-31T00:00:00")).toBe("31-03-2025");
  });

  it("tsUtcSeconds en UTC y truncando a segundos", () => {
    expect(tsUtcSeconds(new Date("2026-06-07T16:03:50Z"))).toBe("2026-06-07T16:03:50Z");
    expect(tsUtcSeconds(new Date("2026-06-07T16:03:50.999Z"))).toBe("2026-06-07T16:03:50Z");
    // un offset distinto de UTC debe convertirse a UTC
    expect(tsUtcSeconds(new Date("2026-01-01T01:30:00+02:00"))).toBe("2025-12-31T23:30:00Z");
  });
});

describe("verifactu · cadena canónica y huella", () => {
  it("la cadena canónica coincide exactamente con la esperada", () => {
    expect(buildCanonical(REF)).toBe(REF_CANONICAL);
  });

  it("la huella es el SHA-256 (hex mayúsculas) del literal, vía independiente", async () => {
    const expected = sha256UpperHex(REF_CANONICAL);
    expect(await computeHuella(REF)).toBe(expected);
    expect(expected).toMatch(/^[0-9A-F]{64}$/);
  });

  it("es determinista", async () => {
    expect(await computeHuella(REF)).toBe(await computeHuella(REF));
  });

  it("cualquier cambio en un campo cambia la huella", async () => {
    const base = await computeHuella(REF);
    const mutations: Array<Partial<HuellaInput>> = [
      { emisorNif: "45872506X" },
      { numero: "FACT/25-05" },
      { fechaExpedicion: "2025-04-01" },
      { cuotaTotal: 1879.51 },
      { importeTotal: 10740.01 },
      { huellaAnterior: "ABC" },
      { genTs: new Date("2026-06-07T16:03:51Z") },
    ];
    for (const m of mutations) {
      expect(await computeHuella({ ...REF, ...m })).not.toBe(base);
    }
  });
});

describe("verifactu · QR", () => {
  it("payload de validación con los datos correctos", () => {
    expect(
      buildQr({
        emisorNif: "45872506H",
        numero: "FACT/25-04",
        fechaExpedicion: "2025-03-31",
        importeTotal: 10740,
      }),
    ).toBe(
      "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=45872506H&numserie=FACT/25-04&fecha=31-03-2025&importe=10740.00",
    );
  });
});

describe("verifactu · encadenado y verificación", () => {
  it("la huella N depende de la N-1, y la cadena verifica", async () => {
    const inv1: HuellaInput = { ...REF };
    const h1 = await computeHuella(inv1);

    const inv2base = {
      emisorNif: "45872506H",
      numero: "FACT/25-05",
      fechaExpedicion: "2025-04-02",
      cuotaTotal: 210.0,
      importeTotal: 1200.0,
      genTs: new Date("2026-06-07T16:10:00Z"),
    };
    const h2 = await computeHuella({ ...inv2base, huellaAnterior: h1 });
    const h2other = await computeHuella({ ...inv2base, huellaAnterior: "OTRA" });
    expect(h2).not.toBe(h2other); // depende de la huella anterior

    const links: ChainLink[] = [
      { ...REF, huella: h1 },
      { ...inv2base, huella: h2 },
    ];
    expect((await verifyChain(links)).ok).toBe(true);
  });

  it("detecta manipulación de datos", async () => {
    const h1 = await computeHuella(REF);
    const tampered: ChainLink[] = [{ ...REF, importeTotal: 99999, huella: h1 }];
    const res = await verifyChain(tampered);
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe(0);
  });

  it("detecta ruptura del encadenado", async () => {
    const h1 = await computeHuella(REF);
    const inv2base = {
      emisorNif: "45872506H",
      numero: "FACT/25-05",
      fechaExpedicion: "2025-04-02",
      cuotaTotal: 210.0,
      importeTotal: 1200.0,
      genTs: new Date("2026-06-07T16:10:00Z"),
    };
    const h2wrong = await computeHuella({ ...inv2base, huellaAnterior: "NO-ES-LA-ANTERIOR" });
    const links: ChainLink[] = [
      { ...REF, huella: h1 },
      { ...inv2base, huella: h2wrong },
    ];
    const res = await verifyChain(links);
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe(1);
  });
});
