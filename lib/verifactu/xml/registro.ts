/**
 * verifactu/xml — generación del XML del registro de facturación (alta/anulación)
 * conforme a los esquemas oficiales SuministroLR.xsd + SuministroInformacion.xsd
 * (ver lib/verifactu/spec/). Módulo PURO: no envía nada a la AEAT, solo serializa.
 *
 * La huella del registro se calcula con el motor ya validado (lib/verifactu) y el
 * campo FechaHoraHusoGenRegistro del XML usa EXACTAMENTE la misma cadena que entra
 * en la huella (genTsString), para que coincidan byte a byte.
 *
 * ⚠️ ImporteTotal = base + IVA (cuota repercutida), SIN restar IRPF (FAQ AEAT nº20:
 *    el IRPF no forma parte del registro de facturación).
 */
import {
  buildCanonical,
  buildCanonicalAnulacion,
  genTsString,
  formatAmount,
  dateDMY,
  type HuellaInput,
  type AnulacionInput,
} from "../canonical";
import { computeHuella, computeHuellaAnulacion } from "../huella";

// Namespaces oficiales (tal y como aparecen en los XSD).
const NS_LR =
  "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd";
const NS_SF =
  "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd";

export const ID_VERSION = "1.0";
export const TIPO_HUELLA_SHA256 = "01"; // L12: SHA-256

/** Datos del SIF (bloque SistemaInformatico). Los fija el PRODUCTOR del software. */
export type SistemaInformatico = {
  /** Razón social del productor del software. */
  nombreRazon: string;
  /** NIF del productor. */
  nif: string;
  /** Nombre comercial del SIF. */
  nombreSistema: string;
  /** Id del SIF: 2 caracteres asignados por el productor. TrackApp = "TA". */
  idSistema: string;
  /** Versión del SIF. */
  version: string;
  /** Nº de instalación, único y nunca repetido para ese obligado. */
  numeroInstalacion: string;
  /** "S" si el producto solo puede operar en VERI*FACTU. */
  soloVerifactu: "S" | "N";
  /** "S" si el producto admite varios obligados tributarios. */
  multiOT: "S" | "N";
  /** "S" si ESTE usuario tiene más de una facturación; "N" si solo una. */
  indicadorMultiplesOT: "S" | "N";
};

/** Una línea del desglose por tipo impositivo. */
export type DetalleDesglose = {
  /** L1: "01" IVA (por defecto), "02" IPSI, "03" IGIC. */
  impuesto?: string;
  /** L8A/L8B: clave de régimen. "01" = general. */
  claveRegimen?: string;
  /** L9: "S1" sujeta y no exenta sin ISP (por defecto), "S2", "N1", "N2". */
  calificacionOperacion?: string;
  /** Tipo impositivo en % (p. ej. 21). */
  tipoImpositivo?: number;
  /** Base imponible. */
  baseImponible: number;
  /** Cuota repercutida (IVA de la línea). */
  cuotaRepercutida?: number;
};

export type RegistroAltaInput = {
  emisorNif: string;
  emisorNombre: string;
  numero: string;
  fechaExpedicion: string; // "YYYY-MM-DD"
  tipoFactura?: string; // "F1" por defecto
  descripcion: string;
  desglose: DetalleDesglose[];
  cuotaTotal: number;
  importeTotal: number; // base + IVA (sin IRPF)
  /** Registro anterior de la cadena; null/undefined = primer registro. */
  anterior?: { emisorNif: string; numero: string; fechaExpedicion: string; huella: string } | null;
  sistema: SistemaInformatico;
  genTs: Date | string;
};

export type RegistroAnulacionInput = {
  emisorNif: string;
  numero: string;
  fechaExpedicion: string; // "YYYY-MM-DD"
  anterior?: { emisorNif: string; numero: string; fechaExpedicion: string; huella: string } | null;
  sistema: SistemaInformatico;
  genTs: Date | string;
};

/** Escapa un valor de texto para incrustarlo en XML. */
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&apos;",
  );
}

const t = (tag: string, value: unknown) => `<sf:${tag}>${esc(value)}</sf:${tag}>`;

function sistemaXml(s: SistemaInformatico): string {
  return (
    `<sf:SistemaInformatico>` +
    t("NombreRazon", s.nombreRazon) +
    t("NIF", s.nif) +
    t("NombreSistemaInformatico", s.nombreSistema) +
    t("IdSistemaInformatico", s.idSistema) +
    t("Version", s.version) +
    t("NumeroInstalacion", s.numeroInstalacion) +
    t("TipoUsoPosibleSoloVerifactu", s.soloVerifactu) +
    t("TipoUsoPosibleMultiOT", s.multiOT) +
    t("IndicadorMultiplesOT", s.indicadorMultiplesOT) +
    `</sf:SistemaInformatico>`
  );
}

function encadenamientoXml(
  anterior?: { emisorNif: string; numero: string; fechaExpedicion: string; huella: string } | null,
): string {
  if (!anterior) return `<sf:Encadenamiento><sf:PrimerRegistro>S</sf:PrimerRegistro></sf:Encadenamiento>`;
  return (
    `<sf:Encadenamiento><sf:RegistroAnterior>` +
    t("IDEmisorFactura", anterior.emisorNif) +
    t("NumSerieFactura", anterior.numero) +
    `<sf:FechaExpedicionFactura>${dateDMY(anterior.fechaExpedicion)}</sf:FechaExpedicionFactura>` +
    t("Huella", anterior.huella) +
    `</sf:RegistroAnterior></sf:Encadenamiento>`
  );
}

function detalleXml(d: DetalleDesglose): string {
  let s = `<sf:DetalleDesglose>`;
  s += t("Impuesto", d.impuesto ?? "01");
  s += t("ClaveRegimen", d.claveRegimen ?? "01");
  s += t("CalificacionOperacion", d.calificacionOperacion ?? "S1");
  if (d.tipoImpositivo != null) s += t("TipoImpositivo", formatAmount(d.tipoImpositivo));
  s += t("BaseImponibleOimporteNoSujeto", formatAmount(d.baseImponible));
  if (d.cuotaRepercutida != null) s += t("CuotaRepercutida", formatAmount(d.cuotaRepercutida));
  s += `</sf:DetalleDesglose>`;
  return s;
}

/**
 * Genera el XML del RegistroAlta (sin envoltorio). Devuelve también la huella y la
 * cadena canónica (para test/depuración). El XML lleva la misma huella calculada.
 */
export async function buildRegistroAltaXml(
  input: RegistroAltaInput,
): Promise<{ xml: string; huella: string; canonical: string }> {
  const tipoFactura = input.tipoFactura ?? "F1";
  const huellaInput: HuellaInput = {
    emisorNif: input.emisorNif,
    numero: input.numero,
    fechaExpedicion: input.fechaExpedicion,
    tipoFactura,
    cuotaTotal: input.cuotaTotal,
    importeTotal: input.importeTotal,
    huellaAnterior: input.anterior?.huella ?? null,
    genTs: input.genTs,
  };
  const canonical = buildCanonical(huellaInput);
  const huella = await computeHuella(huellaInput);

  const xml =
    `<sf:RegistroAlta>` +
    t("IDVersion", ID_VERSION) +
    `<sf:IDFactura>` +
    t("IDEmisorFactura", input.emisorNif) +
    t("NumSerieFactura", input.numero) +
    `<sf:FechaExpedicionFactura>${dateDMY(input.fechaExpedicion)}</sf:FechaExpedicionFactura>` +
    `</sf:IDFactura>` +
    t("NombreRazonEmisor", input.emisorNombre) +
    t("TipoFactura", tipoFactura) +
    t("DescripcionOperacion", input.descripcion) +
    `<sf:Desglose>` +
    input.desglose.map(detalleXml).join("") +
    `</sf:Desglose>` +
    t("CuotaTotal", formatAmount(input.cuotaTotal)) +
    t("ImporteTotal", formatAmount(input.importeTotal)) +
    encadenamientoXml(input.anterior) +
    sistemaXml(input.sistema) +
    `<sf:FechaHoraHusoGenRegistro>${esc(genTsString(input.genTs))}</sf:FechaHoraHusoGenRegistro>` +
    t("TipoHuella", TIPO_HUELLA_SHA256) +
    t("Huella", huella) +
    `</sf:RegistroAlta>`;

  return { xml, huella, canonical };
}

/** Genera el XML del RegistroAnulacion (sin envoltorio). */
export async function buildRegistroAnulacionXml(
  input: RegistroAnulacionInput,
): Promise<{ xml: string; huella: string; canonical: string }> {
  const anulacionInput: AnulacionInput = {
    emisorNif: input.emisorNif,
    numero: input.numero,
    fechaExpedicion: input.fechaExpedicion,
    huellaAnterior: input.anterior?.huella ?? null,
    genTs: input.genTs,
  };
  const canonical = buildCanonicalAnulacion(anulacionInput);
  const huella = await computeHuellaAnulacion(anulacionInput);

  const xml =
    `<sf:RegistroAnulacion>` +
    t("IDVersion", ID_VERSION) +
    `<sf:IDFactura>` +
    t("IDEmisorFacturaAnulada", input.emisorNif) +
    t("NumSerieFacturaAnulada", input.numero) +
    `<sf:FechaExpedicionFacturaAnulada>${dateDMY(input.fechaExpedicion)}</sf:FechaExpedicionFacturaAnulada>` +
    `</sf:IDFactura>` +
    encadenamientoXml(input.anterior) +
    sistemaXml(input.sistema) +
    `<sf:FechaHoraHusoGenRegistro>${esc(genTsString(input.genTs))}</sf:FechaHoraHusoGenRegistro>` +
    t("TipoHuella", TIPO_HUELLA_SHA256) +
    t("Huella", huella) +
    `</sf:RegistroAnulacion>`;

  return { xml, huella, canonical };
}

/**
 * Envuelve uno o varios registros (ya serializados) en el documento raíz
 * RegFactuSistemaFacturacion con su Cabecera (obligado a expedir la factura).
 */
export function wrapEnvelope(
  obligado: { nombreRazon: string; nif: string },
  registros: string[],
): string {
  const cabecera =
    `<sf:Cabecera><sf:ObligadoEmision>` +
    t("NombreRazon", obligado.nombreRazon) +
    t("NIF", obligado.nif) +
    `</sf:ObligadoEmision></sf:Cabecera>`;
  const cuerpo = registros.map((r) => `<sfLR:RegistroFactura>${r}</sfLR:RegistroFactura>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="${NS_LR}" xmlns:sf="${NS_SF}">` +
    cabecera +
    cuerpo +
    `</sfLR:RegFactuSistemaFacturacion>`
  );
}
