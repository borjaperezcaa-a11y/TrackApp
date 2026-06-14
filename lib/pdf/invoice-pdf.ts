/**
 * Genera el PDF A4 de una factura reproduciendo el formato de
 * /reference/Factura_FACT-25-04.pdf (tabla de portes). Se ejecuta en el cliente.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import QRCode from "qrcode";
import type { Invoice, InvoiceLine } from "@/lib/types";
import { amount, eur, dateES } from "@/lib/format";

const BLACK = rgb(0.1, 0.1, 0.12);
const GRAY = rgb(0.45, 0.45, 0.5);
const LINE = rgb(0.8, 0.8, 0.82);
const HEADBG = rgb(0.93, 0.93, 0.94);

// A4 en puntos
const W = 595.28;
const H = 841.89;
const M = 42; // margen

// Columnas de la tabla de portes (x inicial y ancho)
const COLS = {
  fecha: { x: M, w: 62, align: "left" as const },
  origen: { x: M + 62, w: 150, align: "left" as const },
  destino: { x: M + 212, w: 150, align: "left" as const },
  cantidad: { x: M + 362, w: 48, align: "right" as const },
  precio: { x: M + 410, w: 50, align: "right" as const },
  importe: { x: M + 460, w: W - M - (M + 460), align: "right" as const },
};

function format1(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export async function buildInvoicePdf(invoice: Invoice, lines: InvoiceLine[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([W, H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const text = (
    s: string,
    x: number,
    y: number,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; align?: "left" | "right"; w?: number } = {},
  ) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 9;
    let tx = x;
    if (opts.align === "right" && opts.w != null) tx = x + opts.w - f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: tx, y: H - y, size, font: f, color: opts.color ?? BLACK });
  };
  const hline = (y: number, x1 = M, x2 = W - M, color = LINE) =>
    page.drawLine({ start: { x: x1, y: H - y }, end: { x: x2, y: H - y }, thickness: 0.7, color });

  const em = invoice.emisor_snapshot;
  const cl = invoice.cliente_snapshot;

  // ── Logo (si lo hay) arriba a la derecha ──────────────────────────────────
  if (em.logo_url) {
    try {
      const res = await fetch(em.logo_url);
      const bytes = new Uint8Array(await res.arrayBuffer());
      let img: PDFImage | null = null;
      try {
        img = await pdf.embedPng(bytes);
      } catch {
        img = await pdf.embedJpg(bytes);
      }
      if (img) {
        const maxW = 120;
        const maxH = 64;
        const s = Math.min(maxW / img.width, maxH / img.height);
        page.drawImage(img, {
          x: W - M - img.width * s,
          y: H - 40 - img.height * s,
          width: img.width * s,
          height: img.height * s,
        });
      }
    } catch {
      /* logo no embebible (p. ej. SVG): se omite */
    }
  }

  // ── Emisor (arriba izquierda) ─────────────────────────────────────────────
  let y = 56;
  text(em.nombre ?? "", M, y, { font: bold, size: 12 });
  y += 15;
  for (const l of [em.nif, em.direccion, em.cp_localidad]) {
    if (l) {
      text(l, M, y, { size: 9, color: GRAY });
      y += 12;
    }
  }

  // ── Título ────────────────────────────────────────────────────────────────
  text("FACTURA", M, 120, { font: bold, size: 18 });
  hline(128);

  // ── Cliente (izquierda) ─────────────────────────────────────────────────
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

  // ── Meta factura (derecha) ────────────────────────────────────────────────
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

  // ── Cabecera de la tabla de portes ────────────────────────────────────────
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

  // ── Filas ─────────────────────────────────────────────────────────────────
  const clip = (s: string, max: number, f: PDFFont, size: number) => {
    let r = s;
    while (r.length > 3 && f.widthOfTextAtSize(r, size) > max) r = r.slice(0, -1);
    return r === s ? s : r.slice(0, -1) + "…";
  };
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

  // ── Nota legal (izquierda) + Totales (derecha), alineadas ─────────────────
  ty += 24;
  const blockTop = ty;
  const nota =
    "La presente factura se entenderá aceptada en el momento de su cobro salvo que de forma " +
    "expresa sea rechazada en el plazo de 15 días contados desde su recepción.";
  let ny = blockTop;
  for (const line of wrap(nota, font, 8, W - 2 * M - 250)) {
    text(line, M, ny, { size: 8, color: GRAY });
    ny += 11;
  }

  const baseIva = invoice.base + invoice.iva;
  let tot = blockTop;
  const tx = W - M - 240;
  const tw = 240;
  // mini-cabecera
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

  // ── QR + Verifactu (pie, coordenadas desde abajo) ─────────────────────────
  if (invoice.qr) {
    const dataUrl = await QRCode.toDataURL(invoice.qr, { margin: 0, width: 240 });
    const qrImg = await pdf.embedPng(dataUrl);
    page.drawImage(qrImg, { x: M, y: 40, width: 78, height: 78 });
  }
  const fx = M + 92;
  page.drawText("Huella Verifactu (SHA-256):", { x: fx, y: 110, size: 8, font: bold, color: BLACK });
  page.drawText(invoice.huella.slice(0, 48), { x: fx, y: 99, size: 7, font, color: GRAY });
  page.drawText(invoice.huella.slice(48), { x: fx, y: 90, size: 7, font, color: GRAY });
  page.drawText("Documento de prueba: Verifactu NO oficial. No se ha enviado a la AEAT", {
    x: fx,
    y: 70,
    size: 7.5,
    font,
    color: GRAY,
  });
  page.drawText("ni se ha firmado con certificado digital.", {
    x: fx,
    y: 61,
    size: 7.5,
    font,
    color: GRAY,
  });

  return pdf.save();
}

/** Parte un texto en líneas que caben en un ancho dado. */
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
