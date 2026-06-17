/**
 * Genera el PDF A4 de una factura. 3 plantillas seleccionables:
 *   - trackapp : la original (tabla de portes, acento ámbar).
 *   - elegante : barra de acento azul, serif, total en caja.
 *   - moderna  : banda de color en cabecera, tarjetas, total en caja.
 * Se ejecuta en el cliente. pdf-lib (vectorial, fuentes estándar).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import type { Invoice, InvoiceLine } from "@/lib/types";
import { amount, eur, dateES } from "@/lib/format";

export type FacturaPlantilla = "trackapp" | "elegante" | "moderna";

// A4 en puntos
const W = 595.28;
const H = 841.89;

function format1(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Descarga e incrusta el logo (PNG/JPG). Devuelve null si falla o no hay. */
async function embedLogo(pdf: PDFDocument, url?: string | null): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
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

const TERMS =
  "La presente factura se entenderá aceptada en el momento de su cobro salvo que de forma " +
  "expresa sea rechazada en el plazo de 15 días contados desde su recepción.";

const NOTICE =
  "Documento de prueba: Verifactu NO oficial. No se ha enviado a la AEAT ni se ha firmado con certificado digital.";

// ════════════════════════════════════════════════════════════════════════════
// Dispatcher
// ════════════════════════════════════════════════════════════════════════════
export async function buildInvoicePdf(
  invoice: Invoice,
  lines: InvoiceLine[],
  template: FacturaPlantilla = "trackapp",
): Promise<Uint8Array> {
  if (template === "elegante") return buildElegante(invoice, lines);
  if (template === "moderna") return buildModerna(invoice, lines);
  return buildTrackApp(invoice, lines);
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

async function buildTrackApp(invoice: Invoice, lines: InvoiceLine[]): Promise<Uint8Array> {
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
    const s = Math.min(1, 120 / logo.width, 64 / logo.height);
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
  text(esRect ? "FACTURA RECTIFICATIVA" : "FACTURA", M, 120, { font: bold, size: esRect ? 15 : 18 });
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
    text(ln.fecha ? dateES(ln.fecha) : "", COLS.fecha.x + 2, ty, { size: 8.5 });
    text(clip(ln.origen ?? "", COLS.origen.w - 6, font, 8.5), COLS.origen.x + 2, ty, { size: 8.5 });
    text(clip(ln.destino ?? "", COLS.destino.w - 6, font, 8.5), COLS.destino.x + 2, ty, { size: 8.5 });
    text(amount(ln.cantidad), COLS.cantidad.x, ty, { size: 8.5, align: "right", w: COLS.cantidad.w });
    text(amount(ln.precio), COLS.precio.x, ty, { size: 8.5, align: "right", w: COLS.precio.w });
    text(amount(ln.importe), COLS.importe.x, ty, { size: 8.5, align: "right", w: COLS.importe.w - 2 });
    hline(ty + 5, M, W - M, rgb(0.9, 0.9, 0.92));
  }

  ty += 24;
  const blockTop = ty;
  let ny = blockTop;
  for (const line of wrap(TERMS, font, 8, W - 2 * M - 250)) {
    text(line, M, ny, { size: 8, color: GRAY });
    ny += 11;
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
  hline(tot - 4, tx, W - M);
  text(`Retención I.R.P.F.  ${format1(invoice.irpf_rate)}%`, tx, tot + 8, { size: 8.5, color: GRAY });
  text(`-${amount(invoice.irpf)}`, tx, tot + 8, { size: 9, align: "right", w: tw });
  tot += 24;
  page.drawRectangle({ x: tx, y: H - tot - 9, width: tw, height: 22, color: HEADBG });
  text("Total Factura", tx + 6, tot + 6, { font: bold, size: 10 });
  text(eur(invoice.total), tx, tot + 6, { font: bold, size: 12, align: "right", w: tw - 6 });

  const qrImg = await embedQr(pdf, invoice.qr);
  if (qrImg) page.drawImage(qrImg, { x: M, y: 40, width: 78, height: 78 });
  const fx = M + 92;
  page.drawText("Huella Verifactu (SHA-256):", { x: fx, y: 110, size: 8, font: bold, color: BLACK });
  page.drawText(huella.slice(0, 48), { x: fx, y: 99, size: 7, font, color: GRAY });
  page.drawText(huella.slice(48), { x: fx, y: 90, size: 7, font, color: GRAY });
  page.drawText("Documento de prueba: Verifactu NO oficial. No se ha enviado a la AEAT", { x: fx, y: 70, size: 7.5, font, color: GRAY });
  page.drawText("ni se ha firmado con certificado digital.", { x: fx, y: 61, size: 7.5, font, color: GRAY });

  return pdf.save();
}

// ════════════════════════════════════════════════════════════════════════════
// Plantilla ELEGANTE
// ════════════════════════════════════════════════════════════════════════════
async function buildElegante(invoice: Invoice, lines: InvoiceLine[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([W, H]);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const ACCENT = rgb(0.106, 0.227, 0.357); // #1B3A5B
  const INK = rgb(0.102, 0.122, 0.169);
  const SLATE = rgb(0.357, 0.392, 0.447);
  const MUTED = rgb(0.604, 0.635, 0.682);
  const HAIR = rgb(0.894, 0.906, 0.925);
  const m = 50;

  const text = (
    s: string,
    x: number,
    y: number,
    opts: { font?: PDFFont; size?: number; color?: RGB; align?: "left" | "right"; w?: number } = {},
  ) => {
    const f = opts.font ?? sans;
    const size = opts.size ?? 9;
    let tx = x;
    if (opts.align === "right" && opts.w != null) tx = x + opts.w - f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: tx, y: H - y, size, font: f, color: opts.color ?? INK });
  };
  const hline = (y: number, x1 = m, x2 = W - m, color = HAIR, th = 0.8) =>
    page.drawLine({ start: { x: x1, y: H - y }, end: { x: x2, y: H - y }, thickness: th, color });

  const em = invoice.emisor_snapshot ?? ({} as Invoice["emisor_snapshot"]);
  const cl = invoice.cliente_snapshot ?? ({} as Invoice["cliente_snapshot"]);

  // Barra de acento superior
  page.drawRectangle({ x: 0, y: H - 9, width: W, height: 9, color: ACCENT });

  // Logo (izq) + wordmark FACTURA y meta (der)
  const logo = await embedLogo(pdf, em.logo_url);
  if (logo) {
    const s = Math.min(1, 130 / logo.width, 56 / logo.height);
    page.drawImage(logo, { x: m, y: H - 44 - logo.height * s, width: logo.width * s, height: logo.height * s });
  }
  text((invoice.tipo && invoice.tipo !== "F1" ? "RECTIFICATIVA" : "FACTURA").toUpperCase(), W - m - 200, 56, {
    font: serif,
    size: 26,
    color: INK,
    align: "right",
    w: 200,
  });
  let ym = 78;
  const meta: [string, string][] = [
    ["Nº de factura", invoice.numero],
    ["Fecha de emisión", dateES(invoice.fecha)],
  ];
  for (const [k, v] of meta) {
    text(k, W - m - 200, ym, { size: 9.5, color: SLATE });
    text(v, W - m - 200, ym, { size: 11, font: sansB, align: "right", w: 200 });
    ym += 16;
  }

  // Emisor / Cliente
  let py = 132;
  hline(py - 12);
  const colW = (W - 2 * m - 24) / 2;
  const drawParty = (label: string, name: string, lns: (string | null | undefined)[], x: number) => {
    let yy = py;
    text(label.toUpperCase(), x, yy, { size: 9, font: sansB, color: ACCENT });
    yy += 16;
    text(name, x, yy, { font: serif, size: 15, color: INK });
    yy += 16;
    for (const l of lns) {
      if (l) {
        text(l, x, yy, { size: 10.5, color: SLATE });
        yy += 13;
      }
    }
  };
  drawParty("Emisor", em.nombre ?? "", [em.nif ? `NIF ${em.nif}` : null, em.direccion, em.cp_localidad], m);
  drawParty("Cliente", cl.nombre ?? "", [cl.nif ? `NIF ${cl.nif}` : null, cl.direccion, cl.cp_localidad], m + colW + 24);

  // Tabla de conceptos — columnas sin solapes (numéricas alineadas a la derecha)
  const fechaX = m;
  const origenX = m + 58;
  const destinoX = m + 168;
  const destinoW = 96;
  const cantW = 46;
  const precioW = 66;
  const importeW = 72;
  const importeX = W - m - importeW; // 473
  const precioX = importeX - 8 - precioW; // 399
  const cantX = precioX - 8 - cantW; // 345
  let ty = py + 96;
  text("FECHA", fechaX, ty, { size: 9, font: sansB, color: SLATE });
  text("ORIGEN", origenX, ty, { size: 9, font: sansB, color: SLATE });
  text("DESTINO", destinoX, ty, { size: 9, font: sansB, color: SLATE });
  text("CANT.", cantX, ty, { size: 9, font: sansB, color: SLATE, align: "right", w: cantW });
  text("PRECIO", precioX, ty, { size: 9, font: sansB, color: SLATE, align: "right", w: precioW });
  text("IMPORTE", importeX, ty, { size: 9, font: sansB, color: SLATE, align: "right", w: importeW });
  ty += 6;
  hline(ty, m, W - m, INK, 1.4);
  for (const ln of lines) {
    ty += 19;
    text(ln.fecha ? dateES(ln.fecha) : "", fechaX, ty, { size: 10.5 });
    text(clip(ln.origen ?? "", destinoX - origenX - 10, sans, 10.5), origenX, ty, { size: 10.5 });
    text(clip(ln.destino ?? "", destinoW, sans, 10.5), destinoX, ty, { size: 10.5 });
    text(amount(ln.cantidad), cantX, ty, { size: 10.5, align: "right", w: cantW });
    text(amount(ln.precio) + " €", precioX, ty, { size: 10.5, align: "right", w: precioW });
    text(amount(ln.importe) + " €", importeX, ty, { size: 10.5, font: sansB, align: "right", w: importeW });
    ty += 8;
    hline(ty, m, W - m, HAIR);
  }

  // Resumen: datos de pago (izq) + totales (der)
  const sumTop = ty + 28;
  text("DATOS DE PAGO", m, sumTop, { size: 9, font: sansB, color: ACCENT });
  text("Forma de pago", m, sumTop + 18, { size: 10.5, color: SLATE });
  text(invoice.forma_pago, m + 90, sumTop + 18, { size: 10.5, font: sansB });
  if (em.iban) {
    text("IBAN", m, sumTop + 34, { size: 10.5, color: SLATE });
    text(em.iban, m + 90, sumTop + 34, { size: 10.5, font: sansB });
  }
  let tny = sumTop + 58;
  for (const line of wrap(TERMS, sans, 8.5, colW + 10)) {
    text(line, m, tny, { size: 8.5, color: MUTED });
    tny += 11;
  }

  const tboxX = W - m - 210;
  const tboxW = 210;
  let tr = sumTop;
  const trow = (k: string, v: string, boldV = false) => {
    text(k, tboxX, tr, { size: 10.5, color: SLATE });
    text(v, tboxX, tr, { size: 10.5, font: boldV ? sansB : sans, align: "right", w: tboxW });
    tr += 9;
    hline(tr, tboxX, W - m, HAIR);
    tr += 12;
  };
  trow("Base imponible", amount(invoice.base) + " €");
  trow(`IVA (${amount(invoice.iva_rate)}%)`, amount(invoice.iva) + " €");
  if (invoice.irpf > 0) trow(`Retención IRPF (${format1(invoice.irpf_rate)}%)`, "-" + amount(invoice.irpf) + " €");
  // Caja de total
  tr += 4;
  page.drawRectangle({ x: tboxX, y: H - tr - 16, width: tboxW, height: 28, color: ACCENT });
  text("TOTAL FACTURA", tboxX + 12, tr + 2, { size: 10, font: sansB, color: rgb(1, 1, 1) });
  text(eur(invoice.total), tboxX, tr + 4, { size: 15, font: serif, color: rgb(1, 1, 1), align: "right", w: tboxW - 12 });

  // Pie: QR + huella (separador a la altura del pie, no arriba)
  const qrImg = await embedQr(pdf, invoice.qr);
  hline(H - 120, m, W - m, HAIR);
  if (qrImg) page.drawImage(qrImg, { x: m, y: 36, width: 70, height: 70 });
  const fx = qrImg ? m + 86 : m;
  text("HUELLA VERIFACTU (SHA-256)", fx, H - 104, { size: 8.5, font: sansB, color: ACCENT });
  page.drawText((invoice.huella ?? "").slice(0, 48), { x: fx, y: 90, size: 7.5, font: sans, color: SLATE });
  page.drawText((invoice.huella ?? "").slice(48), { x: fx, y: 80, size: 7.5, font: sans, color: SLATE });
  let fny = 64; // coords nativas (origen abajo): pie de página
  for (const line of wrap(NOTICE, sans, 8, W - fx - m)) {
    page.drawText(line, { x: fx, y: fny, size: 8, font: sans, color: MUTED });
    fny -= 10;
  }

  return pdf.save();
}

// ════════════════════════════════════════════════════════════════════════════
// Plantilla MODERNA
// ════════════════════════════════════════════════════════════════════════════
async function buildModerna(invoice: Invoice, lines: InvoiceLine[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([W, H]);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansB = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ACCENT = rgb(0.31, 0.275, 0.898); // #4F46E5
  const SOFT = rgb(0.933, 0.941, 1); // #EEF0FF
  const INK = rgb(0.102, 0.102, 0.18);
  const SLATE = rgb(0.42, 0.447, 0.5);
  const MUTED = rgb(0.61, 0.639, 0.686);
  const LINEC = rgb(0.925, 0.925, 0.953);
  const WHITE = rgb(1, 1, 1);
  const m = 50;

  const text = (
    s: string,
    x: number,
    y: number,
    opts: { font?: PDFFont; size?: number; color?: RGB; align?: "left" | "right"; w?: number } = {},
  ) => {
    const f = opts.font ?? sans;
    const size = opts.size ?? 9;
    let tx = x;
    if (opts.align === "right" && opts.w != null) tx = x + opts.w - f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: tx, y: H - y, size, font: f, color: opts.color ?? INK });
  };

  const em = invoice.emisor_snapshot ?? ({} as Invoice["emisor_snapshot"]);
  const cl = invoice.cliente_snapshot ?? ({} as Invoice["cliente_snapshot"]);

  // Banda de cabecera
  const bandH = 118;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: ACCENT });
  // Logo en chip blanco (izq)
  const logo = await embedLogo(pdf, em.logo_url);
  if (logo) {
    const s = Math.min(1, 120 / logo.width, 40 / logo.height);
    const cw = logo.width * s + 20;
    const ch = logo.height * s + 16;
    page.drawRectangle({ x: m, y: H - 34 - ch, width: cw, height: ch, color: WHITE });
    page.drawImage(logo, { x: m + 10, y: H - 34 - ch + 8, width: logo.width * s, height: logo.height * s });
  }
  // Wordmark + meta (der)
  text(invoice.tipo && invoice.tipo !== "F1" ? "Rectificativa" : "Factura", W - m - 220, 56, {
    font: sansB,
    size: 30,
    color: WHITE,
    align: "right",
    w: 220,
  });
  let ym = 76;
  for (const [k, v] of [
    ["Nº de factura", invoice.numero],
    ["Fecha de emisión", dateES(invoice.fecha)],
  ] as [string, string][]) {
    text(k, W - m - 220, ym, { size: 9.5, color: rgb(0.85, 0.86, 0.98), align: "right", w: 110 });
    text(v, W - m - 110, ym, { size: 11, font: sansB, color: WHITE, align: "right", w: 110 });
    ym += 15;
  }

  // Tarjetas Emisor / Cliente
  const cardY = bandH + 22;
  const cardW = (W - 2 * m - 16) / 2;
  const cardH = 86;
  const drawCard = (label: string, name: string, lns: (string | null | undefined)[], x: number, tint: boolean) => {
    page.drawRectangle({
      x,
      y: H - cardY - cardH,
      width: cardW,
      height: cardH,
      color: tint ? SOFT : rgb(0.969, 0.969, 0.984),
      borderColor: tint ? rgb(0.878, 0.886, 0.98) : LINEC,
      borderWidth: 1,
    });
    let yy = cardY + 18;
    text(label.toUpperCase(), x + 14, yy, { size: 9, font: sansB, color: ACCENT });
    yy += 16;
    text(clip(name, cardW - 28, sansB, 13), x + 14, yy, { font: sansB, size: 13 });
    yy += 14;
    for (const l of lns) {
      if (l) {
        text(clip(l, cardW - 28, sans, 10), x + 14, yy, { size: 10, color: SLATE });
        yy += 12;
      }
    }
  };
  drawCard("Emisor", em.nombre ?? "", [em.nif ? `NIF ${em.nif}` : null, em.direccion, em.cp_localidad], m, false);
  drawCard("Cliente", cl.nombre ?? "", [cl.nif ? `NIF ${cl.nif}` : null, cl.direccion, cl.cp_localidad], m + cardW + 16, true);

  // Tabla de conceptos (cabecera tintada) — columnas sin solapes
  let ty = cardY + cardH + 28;
  const fechaX = m + 10;
  const origenX = m + 66;
  const destinoX = m + 176;
  const destinoW = 92;
  const cantW = 46;
  const precioW = 66;
  const importeW = 72;
  const importeX = W - m - 10 - importeW;
  const precioX = importeX - 8 - precioW;
  const cantX = precioX - 8 - cantW;
  page.drawRectangle({ x: m, y: H - ty - 6, width: W - 2 * m, height: 22, color: SOFT });
  const hY = ty + 9;
  text("FECHA", fechaX, hY, { size: 8.5, font: sansB, color: ACCENT });
  text("ORIGEN", origenX, hY, { size: 8.5, font: sansB, color: ACCENT });
  text("DESTINO", destinoX, hY, { size: 8.5, font: sansB, color: ACCENT });
  text("CANT.", cantX, hY, { size: 8.5, font: sansB, color: ACCENT, align: "right", w: cantW });
  text("PRECIO", precioX, hY, { size: 8.5, font: sansB, color: ACCENT, align: "right", w: precioW });
  text("IMPORTE", importeX, hY, { size: 8.5, font: sansB, color: ACCENT, align: "right", w: importeW });
  ty += 16;
  for (const ln of lines) {
    ty += 19;
    text(ln.fecha ? dateES(ln.fecha) : "", fechaX, ty, { size: 10.5 });
    text(clip(ln.origen ?? "", destinoX - origenX - 10, sans, 10.5), origenX, ty, { size: 10.5 });
    text(clip(ln.destino ?? "", destinoW, sans, 10.5), destinoX, ty, { size: 10.5 });
    text(amount(ln.cantidad), cantX, ty, { size: 10.5, align: "right", w: cantW });
    text(amount(ln.precio) + " €", precioX, ty, { size: 10.5, align: "right", w: precioW });
    text(amount(ln.importe) + " €", importeX, ty, { size: 10.5, font: sansB, align: "right", w: importeW });
    ty += 8;
    page.drawLine({ start: { x: m, y: H - ty }, end: { x: W - m, y: H - ty }, thickness: 0.8, color: LINEC });
  }

  // Totales (caja) a la derecha
  const tboxX = W - m - 210;
  const tboxW = 210;
  let tr = ty + 26;
  const trow = (k: string, v: string) => {
    text(k, tboxX, tr, { size: 10.5, color: SLATE });
    text(v, tboxX, tr, { size: 10.5, font: sansB, align: "right", w: tboxW });
    tr += 18;
  };
  trow("Base imponible", amount(invoice.base) + " €");
  trow(`IVA (${amount(invoice.iva_rate)}%)`, amount(invoice.iva) + " €");
  if (invoice.irpf > 0) trow(`Retención IRPF (${format1(invoice.irpf_rate)}%)`, "-" + amount(invoice.irpf) + " €");
  tr += 2;
  page.drawRectangle({ x: tboxX, y: H - tr - 18, width: tboxW, height: 30, color: ACCENT });
  text("TOTAL FACTURA", tboxX + 12, tr + 3, { size: 9.5, font: sansB, color: WHITE });
  text(eur(invoice.total), tboxX, tr + 5, { size: 16, font: sansB, color: WHITE, align: "right", w: tboxW - 12 });

  // Datos de pago (izq, bajo la tabla)
  const payY = ty + 26;
  text("DATOS DE PAGO", m, payY, { size: 9, font: sansB, color: ACCENT });
  text("Forma de pago", m, payY + 18, { size: 10.5, color: SLATE });
  text(invoice.forma_pago, m + 90, payY + 18, { size: 10.5, font: sansB });
  if (em.iban) {
    text("IBAN", m, payY + 34, { size: 10.5, color: SLATE });
    text(em.iban, m + 90, payY + 34, { size: 10.5, font: sansB });
  }

  // Pie: QR + huella
  const qrImg = await embedQr(pdf, invoice.qr);
  if (qrImg) page.drawImage(qrImg, { x: m, y: 38, width: 66, height: 66 });
  const fx = qrImg ? m + 82 : m;
  text("HUELLA VERIFACTU (SHA-256)", fx, H - 100, { size: 8.5, font: sansB, color: ACCENT });
  page.drawText((invoice.huella ?? "").slice(0, 48), { x: fx, y: 88, size: 7.5, font: sans, color: SLATE });
  page.drawText((invoice.huella ?? "").slice(48), { x: fx, y: 78, size: 7.5, font: sans, color: SLATE });
  let fny = 62; // coords nativas (origen abajo): pie de página
  for (const line of wrap(NOTICE, sans, 8, W - fx - m)) {
    page.drawText(line, { x: fx, y: fny, size: 8, font: sans, color: MUTED });
    fny -= 10;
  }

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
