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

/**
 * Convierte un valor a número de forma SEGURA: si no es finito (null, undefined,
 * texto, NaN) devuelve 0. Imprescindible al agregar importes que vienen de la BD,
 * para que un dato corrupto no contamine un KPI entero con "NaN €".
 */
export function num(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parsea un importe escrito por el usuario a número.
 * - Los <input type="number"> entregan el decimal con PUNTO y sin separador de
 *   millares (formato en-US): "1500.00", "87.4" → se usan tal cual.
 * - Si el usuario teclea formato español con COMA ("1.240,50" o "1240,50"), se
 *   interpreta la coma como decimal y los puntos como millares.
 * Devuelve NaN si la cadena está vacía o no es un número.
 */
export function parseDecimal(s: string): number {
  const t = s.trim();
  if (t === "") return NaN;
  // Con coma → formato español: quita puntos de millar y pasa la coma a punto.
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  // Sin coma → tal cual lo da el input numérico (punto = decimal).
  return Number(t);
}

/** Date | string ISO ("YYYY-MM-DD") → "31/03/2025" (DD/MM/AAAA) */
export function dateES(d: Date | string): string {
  // Caso normal: fechas de Postgres "YYYY-MM-DD". Se formatea desde las propias
  // partes del texto, sin pasar por `new Date`, para que la zona horaria del
  // runtime NO pueda desplazar el día (y se garantice siempre DD/MM/AAAA).
  if (typeof d === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * "31/03/2025" (DD/MM/AAAA) → "2025-03-31" (ISO). Devuelve "" si la fecha no es
 * válida o está incompleta. Rechaza fechas imposibles (ej. 31/02/2025).
 */
export function dmyToISO(s: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return "";
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  // Verifica que la fecha existe de verdad (descarta 31/02, 30/02, etc.).
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "2025-03-31" (para inputs date / Postgres). Estable en zona España. */
export function dateISO(d: Date | string): string {
  if (typeof d === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
    if (m) return m[1];
  }
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  // en-CA produce "YYYY-MM-DD"; fijamos Europe/Madrid para no depender del runtime.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Fecha de HOY en zona España ("Europe/Madrid"), formato "YYYY-MM-DD".
 * Imprescindible en Server Components/acciones: allí `new Date()` es UTC y, de
 * noche, la fecha UTC ya es el día siguiente para España → fecha fiscal errónea.
 */
export function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Partes de la fecha/hora actual en zona España (año, mes 0-11, día, hora 0-23). */
export function nowMadrid(): { year: number; month0: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month0: get("month") - 1, day: get("day"), hour: get("hour") };
}
