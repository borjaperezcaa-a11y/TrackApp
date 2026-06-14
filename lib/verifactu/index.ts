/**
 * verifactu — motor de huella encadenada (SHA-256) + QR para facturación.
 *
 * Módulo INDEPENDIENTE y sin dependencias (solo APIs estándar de JS + Web Crypto).
 * Reutilizable en cualquier proyecto. Ver README.md de esta carpeta.
 *
 * ⚠️ NO certificado: no envía a la AEAT ni firma con certificado digital.
 */

export {
  buildCanonical,
  buildQr,
  formatAmount,
  dateDMY,
  tsUtcSeconds,
  type HuellaInput,
} from "./canonical";

export {
  computeHuella,
  verifyChain,
  verifyInvoice,
  type ChainLink,
  type ChainResult,
} from "./huella";
