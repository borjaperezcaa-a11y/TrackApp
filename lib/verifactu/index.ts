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
  buildCanonicalAnulacion,
  buildQr,
  formatAmount,
  dateDMY,
  tsUtcSeconds,
  type HuellaInput,
  type AnulacionInput,
} from "./canonical";

export {
  computeHuella,
  computeHuellaAnulacion,
  verifyChain,
  verifyInvoice,
  type ChainLink,
  type ChainResult,
} from "./huella";

export {
  buildRegistroAltaXml,
  buildRegistroAnulacionXml,
  wrapEnvelope,
  ID_VERSION,
  TIPO_HUELLA_SHA256,
  type SistemaInformatico,
  type DetalleDesglose,
  type RegistroAltaInput,
  type RegistroAnulacionInput,
} from "./xml/registro";
