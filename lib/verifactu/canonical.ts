/**
 * verifactu/canonical — construcción de la cadena canónica y del QR.
 *
 * Módulo INDEPENDIENTE y SIN DEPENDENCIAS (solo APIs estándar de JS). Pensado
 * para reutilizarse en otros proyectos: cópialo entero o publícalo como paquete.
 *
 * La cadena canónica y su huella SHA-256 encadenada replican, byte a byte, la
 * función Postgres `emit_invoice_from_trips` (supabase/migrations/0003). Cualquier
 * cambio aquí debe reflejarse allí y viceversa (ver verifactu.test.ts: conformidad).
 *
 * ⚠️ Motor NO certificado: no envía registros a la AEAT ni firma con certificado
 *    digital. No constituye facturación oficial Verifactu por sí mismo.
 */

/** Datos mínimos que entran en la huella de una factura. */
export type HuellaInput = {
  /** NIF/CIF del emisor. */
  emisorNif: string;
  /** Número completo de la factura, p. ej. "FACT/25-04". */
  numero: string;
  /** Fecha de expedición en formato "YYYY-MM-DD". */
  fechaExpedicion: string;
  /** Cuota total de IVA repercutido. */
  cuotaTotal: number;
  /** Importe total de la factura (base + IVA − IRPF). */
  importeTotal: number;
  /** Huella de la factura anterior de la cadena (null en la primera). */
  huellaAnterior: string | null;
  /** Instante de generación del registro (se formatea en UTC, segundos). */
  genTs: Date;
  /** Tipo de factura: "F1" normal (por defecto), "R1".."R5" rectificativa. */
  tipoFactura?: string;
};

/**
 * Formatea un importe como hace Postgres `to_char(n, 'FM9999999990.00')`:
 * punto decimal, 2 decimales fijos, SIN separador de millares, sin ceros de
 * relleno a la izquierda (pero al menos un dígito entero), signo solo si negativo.
 *
 * Se redondea a céntimo vía enteros para evitar el clásico error de coma flotante.
 */
export function formatAmount(value: number): string {
  const cents = Math.round(Number(value) * 100);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const decPart = abs % 100;
  return `${sign}${intPart}.${String(decPart).padStart(2, "0")}`;
}

/**
 * "YYYY-MM-DD" → "DD-MM-YYYY" (como `to_char(fecha, 'DD-MM-YYYY')`).
 * Tolera una marca de tiempo al final (toma solo la parte de fecha) y NO usa
 * `Date` para no introducir desfases de zona horaria.
 */
export function dateDMY(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Date → "YYYY-MM-DDTHH:MM:SSZ" en UTC, truncando a segundos. Equivale a
 * `to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`.
 */
export function tsUtcSeconds(date: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}Z`
  );
}

/** Construye la cadena canónica que se va a hashear. */
export function buildCanonical(input: HuellaInput): string {
  return (
    `IDEmisorFactura=${input.emisorNif ?? ""}` +
    `&NumSerieFactura=${input.numero}` +
    `&FechaExpedicionFactura=${dateDMY(input.fechaExpedicion)}` +
    `&TipoFactura=${input.tipoFactura ?? "F1"}` +
    `&CuotaTotal=${formatAmount(input.cuotaTotal)}` +
    `&ImporteTotal=${formatAmount(input.importeTotal)}` +
    `&Huella=${input.huellaAnterior ?? ""}` +
    `&FechaHoraHusoGenRegistro=${tsUtcSeconds(input.genTs)}`
  );
}

/**
 * Construye el payload del QR (estructura de validación de la AEAT). Replica el
 * `v_qr` de la función SQL. No URL-encoded a propósito (conformidad con el valor
 * almacenado); el "/" es válido en query string.
 */
export function buildQr(params: {
  emisorNif: string;
  numero: string;
  fechaExpedicion: string;
  importeTotal: number;
}): string {
  return (
    `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=${params.emisorNif ?? ""}` +
    `&numserie=${params.numero}` +
    `&fecha=${dateDMY(params.fechaExpedicion)}` +
    `&importe=${formatAmount(params.importeTotal)}`
  );
}
