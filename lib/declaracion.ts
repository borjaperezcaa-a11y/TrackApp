/**
 * Datos para la "declaración responsable" del productor (Art. 13 RD 1007/2023).
 * La declaración debe constar por escrito y de modo visible en el sistema, en
 * CADA versión (Art. 13.2), e incluir los datos del Art. 13.4.
 *
 * ⚠️ IMPORTANTE: mantén `cumpleIntegramente` en false mientras el sistema NO
 * cumpla todos los requisitos (hoy faltan el envío a la AEAT y la firma de los
 * registros). Con false, la pantalla muestra la declaración como BORRADOR y NO
 * debe presentarse como definitiva: firmar una declaración de conformidad sin
 * cumplir sería una declaración responsable falsa.
 *
 * Rellena los campos «entre comillas» con los datos REALES del productor antes
 * de poder firmarla.
 */
export const SISTEMA = {
  nombre: "TrackApp",
  version: "0.1.0", // mantener sincronizado con package.json
  tipologia: "Sistema Informático de Facturación (SIF), modalidad VERI*FACTU",

  // Datos del PRODUCTOR del software (Art. 13.4):
  productorNombre: "«Nombre o razón social del productor»",
  productorNif: "«NIF del productor»",
  productorContacto: "«Email o web de contacto»",
  lugarFirma: "«Localidad»",

  // Mientras sea false → la declaración se muestra como BORRADOR.
  cumpleIntegramente: false,
} as const;

/** Funcionalidades de cumplimiento YA implementadas. */
export const CUMPLIMIENTO_HECHO = [
  "Generación de un registro de facturación por cada factura, simultáneo a su expedición (Art. 9).",
  "Huella o «hash» SHA-256 de cada registro y encadenamiento verificable (Art. 10.1.ñ y 12).",
  "Inalterabilidad: las facturas emitidas no se editan ni se borran; las correcciones se hacen con factura rectificativa (Art. 8.2.a).",
  "Numeración correlativa por serie y año, sin huecos ni duplicados.",
  "Registro de eventos automático, solo-anexable y encadenado (Art. 8.3).",
  "Código QR de verificación en la factura (DF 1ª).",
];

/** Requisitos PENDIENTES para poder declarar conformidad plena. */
export const CUMPLIMIENTO_PENDIENTE = [
  "Remisión sistemática de los registros a la AEAT (Art. 15-16, modalidad VERI*FACTU).",
  "Registro de facturación con la estructura y campos completos del Anexo de la Orden HAC/1177/2024 (incl. bloque «SistemaInformático» y desglose de IVA).",
  "Registro de facturación de anulación propio (Art. 11).",
  "Mención «VERI*FACTU» en la factura una vez se remita a la AEAT (DF 1ª).",
];
