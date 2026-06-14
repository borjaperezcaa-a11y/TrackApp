/**
 * Cálculo de totales de factura con aritmética ENTERA en céntimos, para
 * reproducir EXACTAMENTE el `round(..., 2)` de la función Postgres
 * emit_invoice_from_trips (numeric, redondeo medio-hacia-arriba para positivos).
 *
 * Así el total del preview coincide al céntimo con el total emitido por el servidor.
 * (Esto es lógica de negocio de la factura, no del motor verifactu genérico.)
 */

export type InvoiceLineInput = {
  cantidad: number;
  precio: number;
};

export type InvoiceTotals = {
  base: number;
  iva: number;
  irpf: number;
  total: number;
  /** Importe por línea (= round(cantidad*precio, 2)), en el mismo orden. */
  lineImportes: number[];
};

/** round(x, 2) en céntimos: x en "diezmilésimas" enteras → céntimos enteros. */
function centsFromTenThousandths(tenK: number): number {
  // round medio-hacia-arriba para positivos (== Postgres round para no negativos)
  return Math.round(tenK / 100);
}

/** Convierte un número con ≤2 decimales a céntimos enteros de forma robusta. */
function toCents(n: number): number {
  return Math.round(Number(n) * 100);
}

export function computeInvoiceTotals(
  lines: InvoiceLineInput[],
  ivaRate: number,
  irpfRate: number,
): InvoiceTotals {
  // Σ(cantidad*precio) en diezmilésimas exactas (cantidad y precio tienen ≤2 dec.)
  let sumTenK = 0;
  const lineImportes: number[] = [];
  for (const l of lines) {
    const c = toCents(l.cantidad); // cantidad * 100
    const p = toCents(l.precio); // precio * 100
    const productTenK = c * p; // cantidad*precio * 10000
    sumTenK += productTenK;
    lineImportes.push(centsFromTenThousandths(productTenK) / 100);
  }

  const baseCents = centsFromTenThousandths(sumTenK); // round(Σ, 2) en céntimos
  const ivaCenti = toCents(ivaRate); // rate * 100
  const irpfCenti = toCents(irpfRate);

  // round(base * rate / 100, 2) en céntimos = round(baseCents * rateCenti / 10000)
  const ivaCents = Math.round((baseCents * ivaCenti) / 10000);
  const irpfCents = Math.round((baseCents * irpfCenti) / 10000);
  const totalCents = baseCents + ivaCents - irpfCents;

  return {
    base: baseCents / 100,
    iva: ivaCents / 100,
    irpf: irpfCents / 100,
    total: totalCents / 100,
    lineImportes,
  };
}
