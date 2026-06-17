/**
 * Plantillas de factura "Clásica" y "Moderna" renderizadas FIELMENTE a partir
 * de los diseños HTML/CSS originales (elegante.html / moderna.html).
 *
 * Se rasteriza el HTML a imagen (html2canvas) y se vuelca en un A4 (jsPDF).
 * html2canvas y jsPDF se cargan con import() dinámico: SOLO se descargan al
 * generar uno de estos PDF, así no pesan en el arranque de la app.
 *
 * Solo navegador (necesita DOM). En Node (tests) no se invoca: el dispatcher
 * de invoice-pdf.ts deja "trackapp" en pdf-lib (vectorial) para el entorno Node.
 */
import type { Invoice, InvoiceLine } from "@/lib/types";
import { amount, eur, dateES } from "@/lib/format";
import type { FacturaPlantilla } from "./invoice-pdf";

// ── utilidades ──────────────────────────────────────────────────────────────

/** Escapa texto para incrustarlo en HTML sin riesgo de inyección. */
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/** Porcentaje legible: 10 → "10", 10.5 → "10,5" (sin decimales superfluos). */
function pct(n: number): string {
  return Number(n).toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

/** Descarga una imagen (logo) y la convierte a data URL para evitar tainting. */
async function toDataUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Genera el QR como data URL (qrcode se carga en diferido). */
async function qrToDataUrl(qr?: string | null): Promise<string | null> {
  if (!qr) return null;
  try {
    const QR = (await import("qrcode")).default;
    return await QR.toDataURL(qr, { margin: 0, width: 240 });
  } catch {
    return null;
  }
}

// Inyecta las @font-face locales una sola vez (idempotente).
let fontsInjected = false;
function injectFontFaces() {
  if (fontsInjected || document.getElementById("trackapp-pdf-fonts")) {
    fontsInjected = true;
    return;
  }
  const style = document.createElement("style");
  style.id = "trackapp-pdf-fonts";
  style.textContent = `
@font-face{font-family:'Inter';font-weight:400;font-style:normal;font-display:block;src:url('/fonts/Inter-Regular.ttf') format('truetype');}
@font-face{font-family:'Inter';font-weight:700;font-style:normal;font-display:block;src:url('/fonts/Inter-Bold.ttf') format('truetype');}
@font-face{font-family:'Spectral';font-weight:600;font-style:normal;font-display:block;src:url('/fonts/Spectral-SemiBold.ttf') format('truetype');}
@font-face{font-family:'DM Sans';font-weight:400;font-style:normal;font-display:block;src:url('/fonts/DMSans-Regular.ttf') format('truetype');}
@font-face{font-family:'DM Sans';font-weight:700;font-style:normal;font-display:block;src:url('/fonts/DMSans-Bold.ttf') format('truetype');}
@font-face{font-family:'Space Grotesk';font-weight:700;font-style:normal;font-display:block;src:url('/fonts/SpaceGrotesk-Bold.ttf') format('truetype');}
`;
  document.head.appendChild(style);
  fontsInjected = true;
}

async function ensureFonts(template: FacturaPlantilla) {
  injectFontFaces();
  const families =
    template === "moderna"
      ? ["400 14px 'DM Sans'", "700 14px 'DM Sans'", "700 22px 'Space Grotesk'"]
      : ["400 14px Inter", "700 14px Inter", "600 16px Spectral"];
  try {
    await Promise.all(families.map((f) => document.fonts.load(f)));
  } catch {
    /* fuentes no críticas: si fallan, se usa la de respaldo */
  }
  try {
    await document.fonts.ready;
  } catch {
    /* noop */
  }
}

const TERMS =
  "La presente factura se entenderá aceptada en el momento de su cobro, salvo que de forma " +
  "expresa sea rechazada en el plazo de 15 días contados desde su recepción.";
const NOTICE =
  "Documento de prueba · Veri*factu no oficial. No se ha remitido a la AEAT ni se ha firmado con certificado digital.";

function rowsHtml(lines: InvoiceLine[]): string {
  return lines
    .map(
      (ln) => `<tr>
        <td class="c-date">${esc(ln.fecha ? dateES(ln.fecha) : "")}</td>
        <td class="c-from">${esc(ln.origen ?? "")}</td>
        <td class="c-to"><span class="arrow">→</span>${esc(ln.destino ?? "")}</td>
        <td class="c-qty num">${esc(amount(ln.cantidad))}</td>
        <td class="c-price num">${esc(amount(ln.precio))} €</td>
        <td class="c-amount num">${esc(amount(ln.importe))} €</td>
      </tr>`,
    )
    .join("");
}

// ── plantilla CLÁSICA (elegante.html) ────────────────────────────────────────
function eleganteHtml(inv: Invoice, lines: InvoiceLine[], logo: string | null, qr: string | null, borrador = false): string {
  const em = inv.emisor_snapshot ?? ({} as Invoice["emisor_snapshot"]);
  const cl = inv.cliente_snapshot ?? ({} as Invoice["cliente_snapshot"]);
  const titulo = inv.tipo && inv.tipo !== "F1" ? "Rectificativa" : "Factura";
  const irpfRow =
    inv.irpf > 0
      ? `<div class="t-row"><span class="t-k">Retención IRPF (${pct(inv.irpf_rate)}%)</span><span class="t-v">−${esc(amount(inv.irpf))} €</span></div>`
      : "";
  const party = (label: string, name: string, l: (string | null | undefined)[]) =>
    `<div class="party"><p class="eyebrow">${label}</p><p class="party-name">${esc(name)}</p>${l
      .filter(Boolean)
      .map((x) => `<p class="party-line">${esc(x)}</p>`)
      .join("")}</div>`;
  return `<style>
:root{--ink:#1A1F2B;--slate:#5B6472;--muted:#9AA2AE;--hairline:#E4E7EC;--hairline-strong:#CBD0D9;--paper:#FFFFFF;--accent:#1B3A5B;--accent-contrast:#FFFFFF;--font-body:'Inter',system-ui,Arial,sans-serif;--font-display:'Spectral',Georgia,serif;}
.invoice *{box-sizing:border-box;}
.invoice{width:210mm;min-height:297mm;background:var(--paper);padding:22mm 20mm 16mm;position:relative;display:flex;flex-direction:column;color:var(--ink);font-family:var(--font-body);}
.invoice::before{content:"";position:absolute;top:0;left:0;right:0;height:3.2mm;background:var(--accent);}
.invoice .eyebrow{font-size:9px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin:0 0 8px;}
.invoice .masthead{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:20px;min-height:24mm;}
.invoice .logo-slot{flex:0 0 auto;display:flex;align-items:center;}
.invoice .logo-img{max-width:48mm;max-height:24mm;object-fit:contain;}
.invoice .docmeta{text-align:right;}
.invoice .wordmark{font-family:var(--font-display);font-size:30px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);margin:0 0 12px;line-height:1;}
.invoice .meta{display:inline-block;text-align:left;margin:0;}
.invoice .meta-row{display:flex;justify-content:space-between;gap:22px;padding:3px 0;}
.invoice .meta dt{font-size:10.5px;color:var(--slate);}
.invoice .meta dd{margin:0;font-size:12px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;}
.invoice .parties{display:flex;gap:24px;border-top:1px solid var(--hairline);padding-top:20px;}
.invoice .party{flex:1;}
.invoice .party-name{font-family:var(--font-display);font-size:16px;font-weight:600;color:var(--ink);margin:0 0 5px;}
.invoice .party-line{font-size:12px;color:var(--slate);margin:0 0 2px;line-height:1.5;font-variant-numeric:tabular-nums;}
.invoice .items{margin-top:28px;}
.invoice table{width:100%;border-collapse:collapse;}
.invoice thead th{font-size:9.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--slate);text-align:left;padding:0 10px 10px;border-bottom:1.5px solid var(--ink);}
.invoice tbody td{font-size:12.5px;color:var(--ink);vertical-align:top;padding:13px 10px;border-bottom:1px solid var(--hairline);font-variant-numeric:tabular-nums;}
.invoice th:first-child,.invoice td:first-child{padding-left:0;}
.invoice th:last-child,.invoice td:last-child{padding-right:0;}
.invoice th.num,.invoice td.num{text-align:right;}
.invoice td.c-amount{font-weight:600;}
.invoice .c-date,.invoice .c-qty,.invoice .c-price,.invoice .c-amount{width:1%;white-space:nowrap;}
.invoice .arrow{color:var(--accent);font-weight:600;margin-right:5px;}
.invoice .summary{display:flex;gap:34px;margin-top:30px;align-items:flex-start;}
.invoice .summary-left{flex:1;}
.invoice .summary-right{width:80mm;flex:0 0 auto;}
.invoice .pay-row{display:flex;gap:14px;padding:4px 0;font-size:12px;}
.invoice .pay-k{color:var(--slate);width:34mm;flex:0 0 auto;}
.invoice .pay-v{color:var(--ink);font-weight:500;}
.invoice .iban{font-variant-numeric:tabular-nums;letter-spacing:.03em;}
.invoice .terms{margin:20px 0 0;font-size:10px;line-height:1.6;color:var(--muted);max-width:90mm;}
.invoice .totals{width:100%;}
.invoice .t-row{display:flex;justify-content:space-between;padding:9px 0;font-size:12.5px;border-bottom:1px solid var(--hairline);}
.invoice .t-k{color:var(--slate);}
.invoice .t-v{color:var(--ink);font-weight:500;font-variant-numeric:tabular-nums;}
.invoice .t-grand{margin-top:12px;border-bottom:none;align-items:center;background:var(--accent);color:var(--accent-contrast);padding:13px 15px;border-radius:4px;}
.invoice .t-grand .t-k{color:var(--accent-contrast);font-weight:600;font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;}
.invoice .t-grand .t-v{color:var(--accent-contrast);font-family:var(--font-display);font-size:20px;font-weight:600;}
.invoice .docfoot{display:flex;gap:18px;align-items:flex-start;margin-top:auto;padding-top:16px;border-top:1px solid var(--hairline);}
.invoice .qr-slot{flex:0 0 auto;}
.invoice .qr-img{width:26mm;height:26mm;object-fit:contain;}
.invoice .foot-text{flex:1;}
.invoice .hash{font-family:Consolas,'Courier New',monospace;font-size:9.5px;line-height:1.5;color:var(--slate);margin:0 0 10px;word-break:break-all;letter-spacing:.02em;max-width:122mm;}
.invoice .notice{font-size:9.5px;line-height:1.5;color:var(--muted);margin:0;max-width:122mm;}
</style>
<article class="invoice">
  <header class="masthead">
    <div class="logo-slot">${logo ? `<img class="logo-img" src="${logo}" alt="logo">` : ""}</div>
    <div class="docmeta">
      <p class="wordmark">${esc(titulo)}</p>
      <dl class="meta">
        <div class="meta-row"><dt>Nº de factura</dt><dd>${esc(inv.numero)}</dd></div>
        <div class="meta-row"><dt>Fecha de emisión</dt><dd>${esc(dateES(inv.fecha))}</dd></div>
      </dl>
    </div>
  </header>
  <section class="parties">
    ${party("Emisor", em?.nombre ?? "", [em?.nif ? `NIF  ${em.nif}` : null, em?.direccion, em?.cp_localidad])}
    ${party("Cliente", cl?.nombre ?? "", [cl?.nif ? `NIF  ${cl.nif}` : null, cl?.direccion, cl?.cp_localidad])}
  </section>
  <section class="items">
    <table>
      <thead><tr>
        <th class="c-date">Fecha</th><th class="c-from">Origen</th><th class="c-to">Destino</th>
        <th class="c-qty num">Cant.</th><th class="c-price num">Precio</th><th class="c-amount num">Importe</th>
      </tr></thead>
      <tbody>${rowsHtml(lines)}</tbody>
    </table>
  </section>
  <section class="summary">
    <div class="summary-left">
      <p class="eyebrow">Datos de pago</p>
      <div class="pay-row"><span class="pay-k">Forma de pago</span><span class="pay-v">${esc(inv.forma_pago)}</span></div>
      ${em?.iban ? `<div class="pay-row"><span class="pay-k">IBAN</span><span class="pay-v iban">${esc(em.iban)}</span></div>` : ""}
      <p class="terms">${esc(TERMS)}</p>
    </div>
    <div class="summary-right">
      <div class="totals">
        <div class="t-row"><span class="t-k">Base imponible</span><span class="t-v">${esc(amount(inv.base))} €</span></div>
        <div class="t-row"><span class="t-k">IVA (${pct(inv.iva_rate)}%)</span><span class="t-v">${esc(amount(inv.iva))} €</span></div>
        ${irpfRow}
        <div class="t-row t-grand"><span class="t-k">Total factura</span><span class="t-v">${esc(eur(inv.total))}</span></div>
      </div>
    </div>
  </section>
  <footer class="docfoot">
    ${
      borrador
        ? `<div class="foot-text"><p class="eyebrow" style="color:#c0392b">Borrador · sin validez fiscal</p><p class="notice">Vista previa. La factura definitiva (con huella y QR Veri*factu) se genera al emitir.</p></div>`
        : `${qr ? `<div class="qr-slot"><img class="qr-img" src="${qr}" alt="QR Veri*factu"></div>` : ""}
    <div class="foot-text">
      <p class="eyebrow">Huella Veri*factu (SHA-256)</p>
      <p class="hash">${esc(inv.huella ?? "")}</p>
      <p class="notice">${esc(NOTICE)}</p>
    </div>`
    }
  </footer>
</article>`;
}

// ── plantilla MODERNA (moderna.html) ─────────────────────────────────────────
function modernaHtml(inv: Invoice, lines: InvoiceLine[], logo: string | null, qr: string | null, borrador = false): string {
  const em = inv.emisor_snapshot ?? ({} as Invoice["emisor_snapshot"]);
  const cl = inv.cliente_snapshot ?? ({} as Invoice["cliente_snapshot"]);
  const titulo = inv.tipo && inv.tipo !== "F1" ? "Rectificativa" : "Factura";
  const subtotal = inv.base + inv.iva;
  const irpfRow =
    inv.irpf > 0
      ? `<div class="t-row"><span class="t-k">Retención IRPF (${pct(inv.irpf_rate)}%)</span><span class="t-v">−${esc(amount(inv.irpf))} €</span></div>`
      : "";
  const card = (label: string, name: string, l: (string | null | undefined)[], client: boolean) =>
    `<div class="party-card${client ? " is-client" : ""}"><p class="eyebrow">${label}</p><p class="party-name">${esc(name)}</p>${l
      .filter(Boolean)
      .map((x) => `<p class="party-line">${esc(x)}</p>`)
      .join("")}</div>`;
  return `<style>
:root{--ink:#1A1A2E;--slate:#6B7280;--muted:#9CA3AF;--line:#ECECF3;--panel:#F7F7FB;--paper:#FFFFFF;--accent:#4F46E5;--accent-contrast:#FFFFFF;--accent-soft:#EEF0FF;--font-body:'DM Sans',system-ui,Arial,sans-serif;--font-display:'Space Grotesk','DM Sans',sans-serif;}
.invoice *{box-sizing:border-box;}
.invoice{width:210mm;min-height:297mm;background:var(--paper);display:flex;flex-direction:column;overflow:hidden;color:var(--ink);font-family:var(--font-body);}
.invoice .eyebrow{font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:0 0 9px;}
.invoice .band{background:var(--accent);color:var(--accent-contrast);padding:16mm 20mm 14mm;display:flex;justify-content:space-between;align-items:flex-start;gap:24px;}
.invoice .logo-chip{background:#fff;border-radius:10px;padding:11px 15px;display:inline-flex;align-items:center;}
.invoice .logo-img{max-width:46mm;max-height:16mm;object-fit:contain;display:block;}
.invoice .band-meta{text-align:right;}
.invoice .wordmark{font-family:var(--font-display);font-size:34px;font-weight:700;letter-spacing:-.01em;line-height:1;margin:0 0 14px;}
.invoice .bmeta-row{display:flex;justify-content:flex-end;gap:14px;padding:3px 0;}
.invoice .bmeta-row .k{font-size:10.5px;color:rgba(255,255,255,.72);}
.invoice .bmeta-row .v{font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;}
.invoice .body{padding:14mm 20mm 12mm;flex:1;display:flex;flex-direction:column;}
.invoice .parties{display:flex;gap:16px;}
.invoice .party-card{flex:1;border-radius:12px;padding:16px 18px;border:1px solid var(--line);background:var(--panel);}
.invoice .party-card.is-client{background:var(--accent-soft);border-color:#E0E2FA;}
.invoice .party-name{font-family:var(--font-display);font-size:16px;font-weight:600;color:var(--ink);margin:0 0 6px;}
.invoice .party-line{font-size:12px;color:var(--slate);margin:0 0 2px;line-height:1.5;font-variant-numeric:tabular-nums;}
.invoice .items{margin-top:24px;}
.invoice .items-wrap{border:1px solid var(--line);border-radius:12px;overflow:hidden;}
.invoice table{width:100%;border-collapse:collapse;}
.invoice thead th{background:var(--accent-soft);color:var(--accent);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-align:left;padding:12px 16px;}
.invoice tbody td{font-size:12.5px;color:var(--ink);padding:14px 16px;border-top:1px solid var(--line);font-variant-numeric:tabular-nums;}
.invoice tbody tr:first-child td{border-top:none;}
.invoice th.num,.invoice td.num{text-align:right;}
.invoice .c-date,.invoice .c-qty,.invoice .c-price,.invoice .c-amount{width:1%;white-space:nowrap;}
.invoice td.c-amount{font-weight:700;}
.invoice .arrow{color:var(--accent);font-weight:700;margin-right:5px;}
.invoice .summary{display:flex;gap:28px;margin-top:26px;align-items:flex-start;}
.invoice .summary-left{flex:1;}
.invoice .summary-right{width:82mm;flex:0 0 auto;}
.invoice .pay-card{border:1px solid var(--line);border-radius:12px;padding:14px 16px;}
.invoice .pay-row{display:flex;gap:12px;padding:4px 0;font-size:12px;}
.invoice .pay-k{color:var(--slate);width:32mm;flex:0 0 auto;}
.invoice .pay-v{color:var(--ink);font-weight:600;}
.invoice .iban{font-variant-numeric:tabular-nums;letter-spacing:.02em;}
.invoice .terms{margin:14px 2px 0;font-size:10px;line-height:1.6;color:var(--muted);}
.invoice .totals-card{border:1px solid var(--line);border-radius:14px;padding:16px 18px;}
.invoice .t-row{display:flex;justify-content:space-between;padding:8px 0;font-size:12.5px;}
.invoice .t-row + .t-row{border-top:1px solid var(--line);}
.invoice .t-k{color:var(--slate);}
.invoice .t-v{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums;}
.invoice .grand{margin-top:14px;background:var(--accent);color:var(--accent-contrast);border-radius:10px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;}
.invoice .grand .gk{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;}
.invoice .grand .gv{font-family:var(--font-display);font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;}
.invoice .docfoot{display:flex;gap:18px;align-items:flex-start;margin-top:auto;padding-top:18px;border-top:1px solid var(--line);}
.invoice .qr-chip{flex:0 0 auto;border:1px solid var(--line);border-radius:12px;padding:8px;}
.invoice .qr-img{width:24mm;height:24mm;object-fit:contain;display:block;}
.invoice .foot-text{flex:1;}
.invoice .hash{font-family:Consolas,'Courier New',monospace;font-size:9.5px;line-height:1.5;color:var(--slate);margin:0 0 10px;word-break:break-all;letter-spacing:.02em;}
.invoice .notice{font-size:9.5px;line-height:1.5;color:var(--muted);margin:0;}
</style>
<article class="invoice">
  <header class="band">
    ${logo ? `<div class="logo-chip"><img class="logo-img" src="${logo}" alt="logo"></div>` : "<div></div>"}
    <div class="band-meta">
      <p class="wordmark">${esc(titulo)}</p>
      <div class="bmeta-row"><span class="k">Nº de factura</span><span class="v">${esc(inv.numero)}</span></div>
      <div class="bmeta-row"><span class="k">Fecha de emisión</span><span class="v">${esc(dateES(inv.fecha))}</span></div>
    </div>
  </header>
  <div class="body">
    <section class="parties">
      ${card("Emisor", em?.nombre ?? "", [em?.nif ? `NIF  ${em.nif}` : null, em?.direccion, em?.cp_localidad], false)}
      ${card("Cliente", cl?.nombre ?? "", [cl?.nif ? `NIF  ${cl.nif}` : null, cl?.direccion, cl?.cp_localidad], true)}
    </section>
    <section class="items">
      <div class="items-wrap">
        <table>
          <thead><tr>
            <th class="c-date">Fecha</th><th class="c-from">Origen</th><th class="c-to">Destino</th>
            <th class="c-qty num">Cant.</th><th class="c-price num">Precio</th><th class="c-amount num">Importe</th>
          </tr></thead>
          <tbody>${rowsHtml(lines)}</tbody>
        </table>
      </div>
    </section>
    <section class="summary">
      <div class="summary-left">
        <div class="pay-card">
          <p class="eyebrow">Datos de pago</p>
          <div class="pay-row"><span class="pay-k">Forma de pago</span><span class="pay-v">${esc(inv.forma_pago)}</span></div>
          ${em?.iban ? `<div class="pay-row"><span class="pay-k">IBAN</span><span class="pay-v iban">${esc(em.iban)}</span></div>` : ""}
        </div>
        <p class="terms">${esc(TERMS)}</p>
      </div>
      <div class="summary-right">
        <div class="totals-card">
          <div class="t-row"><span class="t-k">Base imponible</span><span class="t-v">${esc(amount(inv.base))} €</span></div>
          <div class="t-row"><span class="t-k">IVA (${pct(inv.iva_rate)}%)</span><span class="t-v">${esc(amount(inv.iva))} €</span></div>
          <div class="t-row"><span class="t-k">Subtotal</span><span class="t-v">${esc(amount(subtotal))} €</span></div>
          ${irpfRow}
          <div class="grand"><span class="gk">Total factura</span><span class="gv">${esc(eur(inv.total))}</span></div>
        </div>
      </div>
    </section>
    <footer class="docfoot">
      ${
        borrador
          ? `<div class="foot-text"><p class="eyebrow" style="color:#c0392b">Borrador · sin validez fiscal</p><p class="notice">Vista previa. La factura definitiva (con huella y QR Veri*factu) se genera al emitir.</p></div>`
          : `${qr ? `<div class="qr-chip"><img class="qr-img" src="${qr}" alt="QR Veri*factu"></div>` : ""}
      <div class="foot-text">
        <p class="eyebrow">Huella Veri*factu (SHA-256)</p>
        <p class="hash">${esc(inv.huella ?? "")}</p>
        <p class="notice">${esc(NOTICE)}</p>
      </div>`
      }
    </footer>
  </div>
</article>`;
}

// ── render HTML → PDF ─────────────────────────────────────────────────────────
export async function buildHtmlPdf(
  invoice: Invoice,
  lines: InvoiceLine[],
  template: FacturaPlantilla,
  borrador = false,
): Promise<Uint8Array> {
  // Carga diferida: estas librerías SOLO se descargan al generar el PDF.
  const [h2cMod, jspdfMod] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const html2canvas = h2cMod.default;
  const { jsPDF } = jspdfMod;

  // En borrador no hay QR (se genera al emitir).
  const [logo, qr] = await Promise.all([
    toDataUrl(invoice.emisor_snapshot?.logo_url),
    borrador ? Promise.resolve(null) : qrToDataUrl(invoice.qr),
  ]);
  const html =
    template === "moderna" ? modernaHtml(invoice, lines, logo, qr, borrador) : eleganteHtml(invoice, lines, logo, qr, borrador);

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;z-index:-1;";
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await ensureFonts(template);
    const el = host.querySelector(".invoice") as HTMLElement;
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pw) / canvas.width;
    const img = canvas.toDataURL("image/png");

    if (imgH <= ph + 1) {
      pdf.addImage(img, "PNG", 0, 0, pw, imgH);
    } else {
      // Factura larga: trocear la imagen en páginas A4.
      let pos = 0;
      let remaining = imgH;
      pdf.addImage(img, "PNG", 0, 0, pw, imgH);
      remaining -= ph;
      while (remaining > 0) {
        pos -= ph;
        pdf.addPage();
        pdf.addImage(img, "PNG", 0, pos, pw, imgH);
        remaining -= ph;
      }
    }
    return new Uint8Array(pdf.output("arraybuffer"));
  } finally {
    document.body.removeChild(host);
  }
}
