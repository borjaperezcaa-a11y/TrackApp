/** Utilidades compartidas para facturas externas (de cooperativa). */

export const EXTERNAL_SOURCES = ["cooperativa", "otra"] as const;
export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

/**
 * Detecta el código de serie a partir del número de una factura externa: toma
 * el prefijo no numérico inicial (el identificador del emisor/serie) sin los
 * separadores finales. P. ej. "COOP/25-1234" → "COOP", "A-2025-001" → "A",
 * "Cooperativa Levante 2025/3" → "Cooperativa Levante". Cadena vacía si el
 * número empieza por dígitos (serie sin prefijo de letras).
 */
export function serieFromNumero(numero: string): string {
  const lead = (numero.trim().match(/^[^\d]*/)?.[0] ?? "").trim();
  return lead.replace(/[\s/\-_.]+$/, "").trim();
}

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
