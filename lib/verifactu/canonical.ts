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
  /**
   * Instante de generación del registro. Si es `Date`, se formatea en UTC con
   * segundos (…Z). Si es `string`, se usa TAL CUAL: imprescindible para que el
   * valor hasheado sea byte-idéntico al del campo `FechaHoraHusoGenRegistro` del
   * XML (la AEAT recalcula la huella sobre ese valor; cualquier diferencia de
   * representación de huso —p. ej. `+01:00` vs `Z`— daría "Aceptado con errores").
   */
  genTs: Date | string;
  /** Tipo de factura: "F1" normal (por defecto), "R1".."R5" rectificativa. */
  tipoFactura?: string;
};

/** Datos mínimos de un registro de ANULACIÓN (5 campos, spec v0.1.2 §3.b). */
export type AnulacionInput = {
  /** NIF/CIF del emisor de la factura anulada. */
  emisorNif: string;
  /** Número completo de la factura anulada. */
  numero: string;
  /** Fecha de expedición de la factura anulada, "YYYY-MM-DD". */
  fechaExpedicion: string;
  /** Huella del registro anterior de la cadena (null si es el primero). */
  huellaAnterior: string | null;
  /** Instante de generación (ver nota en HuellaInput.genTs). */
  genTs: Date | string;
};

/**
 * Formatea un importe como hace Postgres `to_char(n, 'FM9999999990.00')`:
 * punto decimal, 2 decimales fijos, SIN separador de millares, sin ceros de
 * relleno a la izquierda (pero al menos un dígito entero), signo solo si negativo.
 *
 * Se redondea a céntimo vía enteros para evitar el clásico error de coma flotante.
 */
export function formatAmount(value: number): string {
  // Nunca hashear "NaN"/"Infinity": si un importe corrupto llega a la huella,
  // es mejor fallar ruidosamente que sellar basura.
  if (!Number.isFinite(value)) throw new Error(`formatAmount: importe no finito (${value})`);
  const cents = Math.round(value * 100);
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
  if (Number.isNaN(date.getTime())) throw new Error("tsUtcSeconds: fecha inválida");
  const p = (x: number) => String(x).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}Z`
  );
}

/**
 * FechaHoraHusoGenRegistro: string tal cual, o Date → UTC con segundos.
 * Se exporta porque el XML del registro debe llevar EXACTAMENTE este mismo valor
 * en su campo FechaHoraHusoGenRegistro (la AEAT rehace la huella sobre él).
 */
export function genTsString(genTs: Date | string): string {
  return typeof genTs === "string" ? genTs : tsUtcSeconds(genTs);
}

/** Construye la cadena canónica de un registro de ALTA que se va a hashear. */
export function buildCanonical(input: HuellaInput): string {
  return (
    `IDEmisorFactura=${input.emisorNif ?? ""}` +
    `&NumSerieFactura=${input.numero}` +
    `&FechaExpedicionFactura=${dateDMY(input.fechaExpedicion)}` +
    `&TipoFactura=${input.tipoFactura ?? "F1"}` +
    `&CuotaTotal=${formatAmount(input.cuotaTotal)}` +
    `&ImporteTotal=${formatAmount(input.importeTotal)}` +
    `&Huella=${input.huellaAnterior ?? ""}` +
    `&FechaHoraHusoGenRegistro=${genTsString(input.genTs)}`
  );
}

/** Construye la cadena canónica de un registro de ANULACIÓN (spec v0.1.2 §3.b). */
export function buildCanonicalAnulacion(input: AnulacionInput): string {
  return (
    `IDEmisorFacturaAnulada=${input.emisorNif ?? ""}` +
    `&NumSerieFacturaAnulada=${input.numero}` +
    `&FechaExpedicionFacturaAnulada=${dateDMY(input.fechaExpedicion)}` +
    `&Huella=${input.huellaAnterior ?? ""}` +
    `&FechaHoraHusoGenRegistro=${genTsString(input.genTs)}`
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
