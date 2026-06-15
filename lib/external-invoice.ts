/** Utilidades compartidas para facturas externas (de cooperativa). */

export const EXTERNAL_SOURCES = ["cooperativa", "otra"] as const;
export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

/** Datos que la IA extrae de una factura de la cooperativa (cualquiera null). */
export type ExtractedInvoice = {
  numero: string | null;
  fecha: string | null; // YYYY-MM-DD
  cliente: string | null; // destinatario / cliente final
  cliente_nif: string | null;
  concepto: string | null;
  base: number | null;
  iva: number | null;
  iva_rate: number | null;
  irpf: number | null;
  irpf_rate: number | null;
  total: number | null;
  confianza: number; // 0..1
};
