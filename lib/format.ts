/**
 * Formato es-ES: miles con ".", decimales con ",". Números técnicos tabulares.
 * Centralizado para que importes y fechas se vean igual en toda la app y en el PDF.
 */

// useGrouping: "always" → agrupa también los números de 4 cifras (1.000,00),
// como hace la factura de referencia. Sin esto, el locale es-ES los deja sin
// separador (1000) y no cuadraría con /reference/Factura_FACT-25-04.pdf.
// El valor string es válido en runtime; algunas versiones de lib.d.ts aún lo
// tipan como boolean, de ahí el cast.
const ALWAYS = "always" as unknown as boolean;
const eur0 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: ALWAYS,
});

const eur2 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: ALWAYS,
});

const num2 = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: ALWAYS,
});

const int0 = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
  useGrouping: ALWAYS,
});

/** Entero con separador de millares es-ES (sin símbolo): 4.280 */
export function intES(n: number): string {
  return int0.format(n);
}

// ICU separa el número y el símbolo con un espacio fino especial (U+202F/U+00A0).
// La factura de referencia usa un espacio normal → normalizamos.
const normalizeSpaces = (s: string) => s.replace(/[  ]/g, " ");

/** "1.500,40 €" */
export function eur(n: number): string {
  return normalizeSpaces(eur2.format(n));
}

/** "1.500 €" (sin decimales, para KPIs grandes del panel) */
export function eurShort(n: number): string {
  return normalizeSpaces(eur0.format(n));
}

/** "8.950,00" (sin símbolo, para columnas de tabla) */
export function amount(n: number): string {
  return num2.format(n);
}

/** Redondeo a céntimo, medio hacia arriba (coherente con el motor Verifactu). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Date | string ISO → "31/03/2025" */
export function dateES(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** "2025-03-31" (para inputs date / Postgres) */
export function dateISO(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}
