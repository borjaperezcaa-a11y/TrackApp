/**
 * Genera el PDF A4 de una factura. Un único estilo: TrackApp (tabla de portes,
 * acento ámbar, marca del producto al pie). Vectorial con pdf-lib, así que también
 * funciona en Node (tests).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import type { Invoice, InvoiceLine } from "@/lib/types";
import { amount, eur, dateES } from "@/lib/format";

export type FacturaPlantilla = "trackapp" | "elegante" | "moderna";

// A4 en puntos
const W = 595.28;
const H = 841.89;

// Tamaño máximo del logo: IGUAL en las 3 plantillas, para que el mismo logo se
// vea consistente en todas. Se escala para caber sin ampliar (cap a 1x).
const LOGO_MAX_W = 130;
const LOGO_MAX_H = 52;

function format1(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Descarga e incrusta el logo (PNG/JPG). Devuelve null si falla o no hay. */
async function embedLogo(pdf: PDFDocument, url?: string | null): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    try {
      return await pdf.embedPng(bytes);
    } catch {
      try {
        return await pdf.embedJpg(bytes);
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
}

async function embedQr(pdf: PDFDocument, qr?: string | null): Promise<PDFImage | null> {
  if (!qr) return null;
  try {
    const dataUrl = await QRCode.toDataURL(qr, { margin: 0, width: 240 });
    return await pdf.embedPng(dataUrl);
  } catch {
    return null;
  }
}

/** Recorta un texto al ancho máximo, añadiendo … si no cabe. */
function clip(s: string, max: number, f: PDFFont, size: number): string {
  let r = s;
  while (r.length > 3 && f.widthOfTextAtSize(r, size) > max) r = r.slice(0, -1);
  return r === s ? s : r.slice(0, -1) + "…";
}

function wrap(s: string, f: PDFFont, size: number, maxW: number): string[] {
  const words = s.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (f.widthOfTextAtSize(test, size) > maxW && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// Dispatcher
// ════════════════════════════════════════════════════════════════════════════
export async function buildInvoicePdf(
  invoice: Invoice,
  lines: InvoiceLine[],
  _template: FacturaPlantilla = "trackapp", // ya no hay estilos: todas usan TrackApp
  opts: { borrador?: boolean; clausula?: string | null } = {},
): Promise<Uint8Array> {
  return buildTrackApp(invoice, lines, opts.borrador ?? false, (opts.clausula ?? "").trim());
}

// ════════════════════════════════════════════════════════════════════════════
// Plantilla TRACKAPP (la original)
// ════════════════════════════════════════════════════════════════════════════
const BLACK = rgb(0.1, 0.1, 0.12);
const GRAY = rgb(0.45, 0.45, 0.5);
const LINE = rgb(0.8, 0.8, 0.82);
const HEADBG = rgb(0.93, 0.93, 0.94);
const M = 42;

const COLS = {
  fecha: { x: M, w: 62 },
  origen: { x: M + 62, w: 150 },
  destino: { x: M + 212, w: 150 },
  cantidad: { x: M + 362, w: 48 },
  precio: { x: M + 410, w: 50 },
  importe: { x: M + 460, w: W - M - (M + 460) },
};

async function buildTrackApp(
  invoice: Invoice,
  lines: InvoiceLine[],
  borrador = false,
  clausula = "",
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([W, H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const text = (
    s: string,
    x: number,
    y: number,
    opts: { font?: PDFFont; size?: number; color?: RGB; align?: "left" | "right"; w?: number } = {},
  ) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 9;
    let tx = x;
    if (opts.align === "right" && opts.w != null) tx = x + opts.w - f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: tx, y: H - y, size, font: f, color: opts.color ?? BLACK });
  };
  const hline = (y: number, x1 = M, x2 = W - M, color = LINE) =>
    page.drawLine({ start: { x: x1, y: H - y }, end: { x: x2, y: H - y }, thickness: 0.7, color });

  const em = invoice.emisor_snapshot ?? ({} as Invoice["emisor_snapshot"]);
  const cl = invoice.cliente_snapshot ?? ({} as Invoice["cliente_snapshot"]);
  const huella = invoice.huella ?? "";

  const logo = await embedLogo(pdf, em.logo_url);
  if (logo) {
    const s = Math.min(1, LOGO_MAX_W / logo.width, LOGO_MAX_H / logo.height);
    page.drawImage(logo, { x: W - M - logo.width * s, y: H - 40 - logo.height * s, width: logo.width * s, height: logo.height * s });
  }

  let y = 56;
  text(em.nombre ?? "", M, y, { font: bold, size: 12 });
  y += 15;
  for (const l of [em.nif, em.direccion, em.cp_localidad]) {
    if (l) {
      text(l, M, y, { size: 9, color: GRAY });
      y += 12;
    }
  }

  const esRect = invoice.tipo && invoice.tipo !== "F1";
  const titulo = esRect ? "FACTURA RECTIFICATIVA" : "FACTURA";
  const tsize = esRect ? 15 : 18;
  text(titulo, M, 120, { font: bold, size: tsize });
  if (borrador) {
    text("· BORRADOR", M + bold.widthOfTextAtSize(titulo, tsize) + 8, 120, { font: bold, size: 13, color: rgb(0.78, 0.2, 0.2) });
  }
  hline(128);

  let yc = 150;
  text("CLIENTE", M, yc, { font: bold, size: 9, color: GRAY });
  yc += 15;
  if (cl.nombre) {
    text(cl.nombre, M, yc, { font: bold, size: 10 });
    yc += 13;
  }
  for (const l of [cl.nif, cl.direccion, cl.cp_localidad]) {
    if (l) {
      text(l, M, yc, { size: 9, color: GRAY });
      yc += 12;
    }
  }

  const mx = W - M - 200;
  const mxw = 200;
  let ym = 150;
  const meta: [string, string][] = [
    ["Nº Factura:", invoice.numero],
    ["Fecha:", dateES(invoice.fecha)],
    ["F. de pago:", invoice.forma_pago],
  ];
  if (em.iban) meta.push(["IBAN:", em.iban]);
  for (const [k, v] of meta) {
    text(k, mx, ym, { size: 9, color: GRAY });
    text(v, mx, ym, { size: 9, font: bold, align: "right", w: mxw });
    ym += 14;
  }

  let ty = Math.max(yc, ym) + 16;
  page.drawRectangle({ x: M, y: H - ty - 4, width: W - 2 * M, height: 18, color: HEADBG });
  const headY = ty + 9;
  text("FECHA", COLS.fecha.x + 2, headY, { font: bold, size: 8 });
  text("ORIGEN", COLS.origen.x + 2, headY, { font: bold, size: 8 });
  text("DESTINO", COLS.destino.x + 2, headY, { font: bold, size: 8 });
  text("Cantidad", COLS.cantidad.x, headY, { font: bold, size: 8, align: "right", w: COLS.cantidad.w });
  text("Precio", COLS.precio.x, headY, { font: bold, size: 8, align: "right", w: COLS.precio.w });
  text("IMPORTE", COLS.importe.x, headY, { font: bold, size: 8, align: "right", w: COLS.importe.w - 2 });
  ty += 18;

  for (const ln of lines) {
    ty += 15;
    // Origen/destino pueden traer VARIAS paradas (grupaje), una por línea.
    const oLines = (ln.origen ?? "").split("\n");
    const dLines = (ln.destino ?? "").split("\n");
    const nSub = Math.max(1, oLines.length, dLines.length);
    text(ln.fecha ? dateES(ln.fecha) : "", COLS.fecha.x + 2, ty, { size: 8.5 });
    oLines.forEach((s, k) => text(clip(s, COLS.origen.w - 6, font, 8.5), COLS.origen.x + 2, ty + k * 10, { size: 8.5 }));
    dLines.forEach((s, k) => text(clip(s, COLS.destino.w - 6, font, 8.5), COLS.destino.x + 2, ty + k * 10, { size: 8.5 }));
    text(amount(ln.cantidad), COLS.cantidad.x, ty, { size: 8.5, align: "right", w: COLS.cantidad.w });
    text(amount(ln.precio), COLS.precio.x, ty, { size: 8.5, align: "right", w: COLS.precio.w });
    text(amount(ln.importe), COLS.importe.x, ty, { size: 8.5, align: "right", w: COLS.importe.w - 2 });
    ty += (nSub - 1) * 10; // altura extra por las paradas adicionales
    // Descripción del porte como concepto, debajo de la ruta (solo si viene).
    const desc = (ln.descripcion ?? "").trim();
    if (desc) {
      const descLines = wrap(desc, font, 7.5, COLS.origen.w + COLS.destino.w - 6);
      descLines.forEach((s, k) => text(s, COLS.origen.x + 2, ty + 11 + k * 9, { size: 7.5, color: GRAY }));
      ty += 11 + (descLines.length - 1) * 9;
    }
    hline(ty + 5, M, W - M, rgb(0.9, 0.9, 0.92));
  }

  ty += 24;
  const blockTop = ty;
  // Cláusula de condiciones (texto del usuario; vacía = no se imprime).
  if (clausula) {
    let ny = blockTop;
    for (const line of wrap(clausula, font, 8, W - 2 * M - 250)) {
      text(line, M, ny, { size: 8, color: GRAY });
      ny += 11;
    }
  }

  const baseIva = invoice.base + invoice.iva;
  let tot = blockTop;
  const tx = W - M - 240;
  const tw = 240;
  text("Base Imponible", tx, tot, { size: 8, color: GRAY });
  text("% IVA", tx + 110, tot, { size: 8, color: GRAY, align: "right", w: 40 });
  text("Cuota", tx + 150, tot, { size: 8, color: GRAY, align: "right", w: 40 });
  text("Total", tx + 190, tot, { size: 8, color: GRAY, align: "right", w: 50 });
  tot += 13;
  text(amount(invoice.base), tx, tot, { size: 9, font: bold });
  text(amount(invoice.iva_rate), tx + 110, tot, { size: 9, align: "right", w: 40 });
  text(amount(invoice.iva), tx + 150, tot, { size: 9, align: "right", w: 40 });
  text(amount(baseIva), tx + 190, tot, { size: 9, font: bold, align: "right", w: 50 });
  tot += 16;
  // La retención solo se muestra si la hay (coherente con las plantillas HTML).
  if (invoice.irpf > 0) {
    hline(tot - 4, tx, W - M);
    text(`Retención I.R.P.F.  ${format1(invoice.irpf_rate)}%`, tx, tot + 8, { size: 8.5, color: GRAY });
    text(`-${amount(invoice.irpf)}`, tx, tot + 8, { size: 9, align: "right", w: tw });
    tot += 24;
  }
  page.drawRectangle({ x: tx, y: H - tot - 9, width: tw, height: 22, color: HEADBG });
  text("Total Factura", tx + 6, tot + 6, { font: bold, size: 10 });
  text(eur(invoice.total), tx, tot + 6, { font: bold, size: 12, align: "right", w: tw - 6 });

  if (borrador) {
    // Vista previa: sin huella ni QR (se generan al emitir).
    page.drawText("BORRADOR · SIN VALIDEZ FISCAL", { x: M, y: 80, size: 12, font: bold, color: rgb(0.78, 0.2, 0.2) });
    page.drawText("Vista previa. La factura definitiva (con huella y QR Veri*factu) se genera al emitir.", {
      x: M,
      y: 64,
      size: 8.5,
      font,
      color: GRAY,
    });
  } else {
    const qrImg = await embedQr(pdf, invoice.qr);
    if (qrImg) page.drawImage(qrImg, { x: M, y: 54, width: 78, height: 78 });
    const fx = M + 92;
    page.drawText("Huella Verifactu (SHA-256):", { x: fx, y: 120, size: 8, font: bold, color: BLACK });
    page.drawText(huella.slice(0, 48), { x: fx, y: 109, size: 7, font, color: GRAY });
    page.drawText(huella.slice(48), { x: fx, y: 100, size: 7, font, color: GRAY });
    page.drawText("Documento de prueba: Verifactu NO oficial. No se ha enviado a la AEAT", { x: fx, y: 80, size: 7.5, font, color: GRAY });
    page.drawText("ni se ha firmado con certificado digital.", { x: fx, y: 71, size: 7.5, font, color: GRAY });
  }

  // Marca del producto: "Factura generada con TrackApp", centrada al pie.
  const b1 = "Factura generada con ";
  const b2 = "TrackApp";
  const b3 = " — gestión y facturación para transportistas";
  const bs = 9;
  const w1 = font.widthOfTextAtSize(b1, bs);
  const w2 = bold.widthOfTextAtSize(b2, bs);
  const w3 = font.widthOfTextAtSize(b3, bs);
  const bx = (W - (w1 + w2 + w3)) / 2;
  page.drawText(b1, { x: bx, y: 34, size: bs, font, color: GRAY });
  page.drawText(b2, { x: bx + w1, y: 34, size: bs, font: bold, color: rgb(0.91, 0.57, 0.05) });
  page.drawText(b3, { x: bx + w1 + w2, y: 34, size: bs, font, color: GRAY });

  return pdf.save();
}

// ════════════════════════════════════════════════════════════════════════════
// Factura de EJEMPLO (para previsualizar plantillas en el perfil)
// ════════════════════════════════════════════════════════════════════════════
export function sampleInvoice(logoUrl?: string | null): { invoice: Invoice; lines: InvoiceLine[] } {
  const invoice = {
    numero: "FACT/26-08",
    fecha: "2026-06-16",
    forma_pago: "Transferencia",
    tipo: "F1",
    base: 1300,
    iva_rate: 10,
    iva: 130,
    irpf_rate: 1,
    irpf: 13,
    total: 1417,
    huella: "394107E646DC0964947851C57D3C90E5C13F79F5D8FA3E013C10881AF97EC817",
    qr: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=12345678Z&numserie=FACT/26-08",
    emisor_snapshot: {
      nombre: "Paloma Pérez",
      nif: "12345678Z",
      direccion: "Calle Medina 11",
      cp_localidad: "36001 Pontevedra",
      iban: "ES91 2100 0418 4502 0005 1332",
      logo_url: logoUrl ?? null,
    },
    cliente_snapshot: {
      nombre: "Transportes García, S.L.",
      nif: "87654321X",
      direccion: "Calle Maldonado",
      cp_localidad: "30100 Murcia",
    },
  } as unknown as Invoice;
  const lines = [
    { fecha: "2026-06-16", origen: "Pontevedra", destino: "Irún", cantidad: 1, precio: 1300, importe: 1300 },
  ] as unknown as InvoiceLine[];
  return { invoice, lines };
}
