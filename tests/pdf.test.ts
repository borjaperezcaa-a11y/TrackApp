import { describe, it, expect } from "vitest";
import { buildInvoicePdf } from "@/lib/pdf/invoice-pdf";
import type { Invoice, InvoiceLine } from "@/lib/types";

const invoice: Invoice = {
  id: "inv-1",
  user_id: "u-1",
  numero: "FACT/25-04",
  serie: "FACT",
  anio: 2025,
  num: 4,
  chain_index: 4,
  client_id: "c-1",
  fecha: "2025-03-31",
  forma_pago: "Transferencia",
  base: 8950,
  iva_rate: 21,
  iva: 1879.5,
  irpf_rate: 1,
  irpf: 89.5,
  total: 10740,
  prev_hash: null,
  huella: "A".repeat(64),
  gen_ts: "2026-06-07T16:03:50Z",
  qr: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=45872506H&numserie=FACT/25-04&fecha=31-03-2025&importe=10740.00",
  // acentos, símbolos y ordinal masculino para verificar la codificación WinAnsi
  emisor_snapshot: {
    nombre: "Marcos Fuentes Vidal",
    nif: "45872506H",
    direccion: "Lgar. Escuadro – Cumbraos, 20",
    cp_localidad: "36540 SILLEDA (PONTEVEDRA)",
    iban: "ES13 0182 6050 6202 0156 7707",
    logo_url: null,
    serie: "FACT",
  },
  cliente_snapshot: {
    nombre: "Daniel López Suárez",
    nif: "76825348N",
    direccion: "R/ Carballeira do Chousiño, 8 – 1ºE",
    cp_localidad: "36540 Silleda - Pontevedra",
    condiciones_pago: "Transferencia",
  },
  pagada: false,
  emitida_at: "2026-06-07T16:03:50Z",
  tipo: "F1",
  rectifica_id: null,
  motivo: null,
};

const lines: InvoiceLine[] = [
  {
    id: "l1",
    invoice_id: "inv-1",
    trip_id: "t1",
    fecha: "2025-03-13",
    origen: "Capresse Michelangelo - IT (52033) muy largo para forzar recorte",
    destino: "Sarria (27617)",
    descripcion: "24 t de fruta",
    cantidad: 1,
    precio: 2600,
    importe: 2600,
    orden: 0,
  },
  {
    id: "l2",
    invoice_id: "inv-1",
    trip_id: "t2",
    fecha: "2025-03-26",
    origen: "Legardeta (31132)",
    destino: "Criquebeuf-sur-Seine -FR (27340)",
    descripcion: null,
    cantidad: 1,
    precio: 1150,
    importe: 1150,
    orden: 1,
  },
];

describe("buildInvoicePdf", () => {
  it("genera un PDF válido sin reventar por codificación de caracteres", async () => {
    const bytes = await buildInvoicePdf(invoice, lines);
    expect(bytes.length).toBeGreaterThan(1000);
    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("también funciona con IRPF 0 y un solo porte", async () => {
    const bytes = await buildInvoicePdf(
      { ...invoice, irpf: 0, irpf_rate: 0, total: 10829.5 },
      [lines[0]],
    );
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("la plantilla trackapp genera un PDF válido (WinAnsi, vectorial en Node)", async () => {
    const bytes = await buildInvoicePdf(invoice, lines, "trackapp");
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  // Clásica/Moderna se renderizan desde HTML (html2canvas+jspdf) y requieren un
  // navegador con DOM; no se pueden ejercitar en el entorno Node de vitest. Su
  // salida se valida manualmente desde "Mi Perfil" (previsualización) y al
  // generar facturas reales en la app.
});
