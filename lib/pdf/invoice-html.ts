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

/** Solo admite `data:` o `https:` en los src (logo/QR): evita inyección de atributo/SSRF. */
function safeUrl(u: string | null): string {
  return u && /^(data:|https:)/i.test(u) ? u : "";
}

/** Porcentaje legible: 10 → "10", 10.5 → "10,5" (sin decimales superfluos). */
function pct(n: number): string {
  return Number(n).toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

/** Descarga una imagen (logo) y la convierte a data URL para evitar tainting. */
async function toDataUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
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

// Varias paradas (grupaje) llegan separadas por "\n": se apilan con <br>.
function multilinea(s: string | null): string {
  return esc(s ?? "").split("\n").join("<br>");
}

function rowsHtml(lines: InvoiceLine[]): string {
  return lines
    .map((ln) => {
      const desc = (ln.descripcion ?? "").trim();
      return `<tr>
        <td class="c-date">${esc(ln.fecha ? dateES(ln.fecha) : "")}</td>
        <td class="c-from">${multilinea(ln.origen)}${desc ? `<div class="line-desc">${esc(desc)}</div>` : ""}</td>
        <td class="c-to"><span class="arrow">→</span>${multilinea(ln.destino)}</td>
        <td class="c-qty num">${esc(amount(ln.cantidad))}</td>
        <td class="c-price num">${esc(amount(ln.precio))} €</td>
        <td class="c-amount num">${esc(amount(ln.importe))} €</td>
      </tr>`;
    })
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
.invoice{--ink:#1A1F2B;--slate:#5B6472;--muted:#9AA2AE;--hairline:#E4E7EC;--hairline-strong:#CBD0D9;--paper:#FFFFFF;--accent:#1B3A5B;--accent-contrast:#FFFFFF;--font-body:'Inter',system-ui,Arial,sans-serif;--font-display:'Spectral',Georgia,serif;}
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
.invoice .line-desc{font-size:10.5px;color:var(--muted);margin-top:5px;line-height:1.4;}
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
    <div class="logo-slot">${logo ? `<img class="logo-img" src="${safeUrl(logo)}" alt="logo">` : ""}</div>
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
        : `${qr ? `<div class="qr-slot"><img class="qr-img" src="${safeUrl(qr)}" alt="QR Veri*factu"></div>` : ""}
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
.invoice{--ink:#1A1A2E;--slate:#6B7280;--muted:#9CA3AF;--line:#ECECF3;--panel:#F7F7FB;--paper:#FFFFFF;--accent:#4F46E5;--accent-contrast:#FFFFFF;--accent-soft:#EEF0FF;--font-body:'DM Sans',system-ui,Arial,sans-serif;--font-display:'Space Grotesk','DM Sans',sans-serif;}
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
.invoice .line-desc{font-size:10.5px;color:var(--muted);margin-top:5px;line-height:1.4;}
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
    ${logo ? `<div class="logo-chip"><img class="logo-img" src="${safeUrl(logo)}" alt="logo"></div>` : "<div></div>"}
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
          : `${qr ? `<div class="qr-chip"><img class="qr-img" src="${safeUrl(qr)}" alt="QR Veri*factu"></div>` : ""}
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

// ── plantilla TRACKAPP en HTML (solo para la previsualización de estilos) ─────
// El PDF real de "trackapp" se genera con pdf-lib (invoice-pdf.ts); esta versión
// HTML existe únicamente para renderizar la imagen de muestra en el comparador.
function trackappHtml(inv: Invoice, lines: InvoiceLine[], logo: string | null, qr: string | null): string {
  const em = inv.emisor_snapshot ?? ({} as Invoice["emisor_snapshot"]);
  const cl = inv.cliente_snapshot ?? ({} as Invoice["cliente_snapshot"]);
  const linea = (x: string | null | undefined) => (x ? `<div class="em-line">${esc(x)}</div>` : "");
  return `<style>
.invoice{--ink:#1a1a1f;--gray:#73737a;--line:#d4d4d8;--head:#ededee;--amber:#E8920C;--font:'Archivo',system-ui,Arial,sans-serif;--display:'Saira Condensed','Archivo',sans-serif;}
.invoice *{box-sizing:border-box;}
.invoice{width:210mm;min-height:297mm;background:#fff;color:var(--ink);font-family:var(--font);padding:14mm 12mm;font-size:12px;}
.invoice .top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;}
.invoice .em-name{font-weight:700;font-size:16px;}
.invoice .em-line{color:var(--gray);font-size:11px;margin-top:2px;}
.invoice .logo{max-width:46mm;max-height:20mm;object-fit:contain;}
.invoice .title{font-family:var(--display);font-weight:700;font-size:26px;letter-spacing:.04em;margin:14px 0 6px;}
.invoice .hr{height:1px;background:var(--line);margin:6px 0 14px;}
.invoice .cols{display:flex;justify-content:space-between;gap:24px;}
.invoice .eyebrow{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gray);}
.invoice .cl-name{font-weight:700;margin-top:5px;}
.invoice .meta{min-width:64mm;}
.invoice .meta-row{display:flex;justify-content:space-between;gap:18px;padding:2px 0;font-size:11px;}
.invoice .meta-k{color:var(--gray);}
.invoice .meta-v{font-weight:600;font-variant-numeric:tabular-nums;}
.invoice table{width:100%;border-collapse:collapse;margin-top:16px;}
.invoice thead th{background:var(--head);font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;text-align:left;padding:7px 8px;}
.invoice tbody td{font-size:11px;padding:9px 8px;border-bottom:1px solid #ececee;vertical-align:top;}
.invoice th.num,.invoice td.num{text-align:right;}
.invoice td.amount{font-weight:700;}
.invoice .totals{display:flex;justify-content:flex-end;margin-top:18px;}
.invoice .totals-box{width:84mm;}
.invoice .t-row{display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0;}
.invoice .t-k{color:var(--gray);}
.invoice .t-grand{display:flex;justify-content:space-between;align-items:center;background:var(--head);border-radius:4px;padding:9px 12px;margin-top:8px;}
.invoice .t-grand .k{font-weight:700;}
.invoice .t-grand .v{font-family:var(--display);font-weight:700;font-size:18px;color:var(--amber);}
.invoice .foot{display:flex;gap:14px;align-items:flex-start;margin-top:24px;padding-top:12px;border-top:1px solid var(--line);}
.invoice .qr{width:24mm;height:24mm;object-fit:contain;}
.invoice .hash{font-family:Consolas,'Courier New',monospace;font-size:8.5px;color:var(--gray);word-break:break-all;}
.invoice .notice{font-size:8.5px;color:var(--gray);margin-top:6px;}
</style>
<article class="invoice">
  <div class="top">
    <div>
      <div class="em-name">${esc(em?.nombre ?? "")}</div>
      ${[em?.nif, em?.direccion, em?.cp_localidad].map(linea).join("")}
    </div>
    ${logo ? `<img class="logo" src="${logo}" alt="logo">` : ""}
  </div>
  <div class="title">FACTURA</div>
  <div class="hr"></div>
  <div class="cols">
    <div>
      <div class="eyebrow">Cliente</div>
      <div class="cl-name">${esc(cl?.nombre ?? "")}</div>
      ${[cl?.nif, cl?.direccion, cl?.cp_localidad].map(linea).join("")}
    </div>
    <div class="meta">
      <div class="meta-row"><span class="meta-k">Nº Factura</span><span class="meta-v">${esc(inv.numero)}</span></div>
      <div class="meta-row"><span class="meta-k">Fecha</span><span class="meta-v">${esc(dateES(inv.fecha))}</span></div>
      <div class="meta-row"><span class="meta-k">F. de pago</span><span class="meta-v">${esc(inv.forma_pago)}</span></div>
      ${em?.iban ? `<div class="meta-row"><span class="meta-k">IBAN</span><span class="meta-v">${esc(em.iban)}</span></div>` : ""}
    </div>
  </div>
  <table>
    <thead><tr><th>Fecha</th><th>Origen</th><th>Destino</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
    <tbody>${lines
      .map(
        (ln) => `<tr><td>${esc(ln.fecha ? dateES(ln.fecha) : "")}</td><td>${multilinea(ln.origen)}</td><td>${multilinea(ln.destino)}</td><td class="num">${esc(amount(ln.cantidad))}</td><td class="num">${esc(amount(ln.precio))}</td><td class="num amount">${esc(amount(ln.importe))}</td></tr>`,
      )
      .join("")}</tbody>
  </table>
  <div class="totals"><div class="totals-box">
    <div class="t-row"><span class="t-k">Base imponible</span><span>${esc(amount(inv.base))} €</span></div>
    <div class="t-row"><span class="t-k">IVA (${pct(inv.iva_rate)}%)</span><span>${esc(amount(inv.iva))} €</span></div>
    ${inv.irpf > 0 ? `<div class="t-row"><span class="t-k">Retención IRPF (${pct(inv.irpf_rate)}%)</span><span>−${esc(amount(inv.irpf))} €</span></div>` : ""}
    <div class="t-grand"><span class="k">Total Factura</span><span class="v">${esc(eur(inv.total))}</span></div>
  </div></div>
  <div class="foot">
    ${qr ? `<img class="qr" src="${qr}" alt="QR">` : ""}
    <div>
      <div class="eyebrow">Huella Veri*factu (SHA-256)</div>
      <div class="hash">${esc(inv.huella ?? "")}</div>
      <div class="notice">${esc(NOTICE)}</div>
    </div>
  </div>
</article>`;
}

// Factura de ejemplo para el comparador de estilos (sin logo ni QR externos).
const PREVIEW_INVOICE = {
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
  qr: null,
  emisor_snapshot: {
    nombre: "Paloma Pérez",
    nif: "12345678Z",
    direccion: "Calle Medina 11",
    cp_localidad: "36001 Pontevedra",
    iban: "ES91 2100 0418 4502 0005 1332",
    logo_url: null,
  },
  cliente_snapshot: { nombre: "Transportes García, S.L.", nif: "87654321X", direccion: "Calle Maldonado", cp_localidad: "30100 Murcia" },
} as unknown as Invoice;
const PREVIEW_LINES = [
  { fecha: "2026-06-16", origen: "Pontevedra", destino: "Irún", cantidad: 1, precio: 800, importe: 800 },
  { fecha: "2026-06-16", origen: "Vigo", destino: "Madrid", cantidad: 1, precio: 500, importe: 500 },
] as unknown as InvoiceLine[];

function htmlForPreview(template: FacturaPlantilla): string {
  if (template === "moderna") return modernaHtml(PREVIEW_INVOICE, PREVIEW_LINES, null, null, false);
  if (template === "elegante") return eleganteHtml(PREVIEW_INVOICE, PREVIEW_LINES, null, null, false);
  return trackappHtml(PREVIEW_INVOICE, PREVIEW_LINES, null, null);
}

/**
 * Renderiza la factura de EJEMPLO de un estilo a una imagen PNG (data URL), para
 * el comparador de estilos del perfil. Solo navegador (html2canvas en diferido).
 */
export async function renderStylePreview(template: FacturaPlantilla): Promise<string> {
  const html2canvas = (await import("html2canvas")).default;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;z-index:-1;";
  host.innerHTML = htmlForPreview(template);
  document.body.appendChild(host);
  try {
    await ensureFonts(template === "moderna" ? "moderna" : "elegante");
    const el = host.querySelector(".invoice") as HTMLElement;
    const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, backgroundColor: "#ffffff", logging: false });
    return canvas.toDataURL("image/png");
  } finally {
    document.body.removeChild(host);
  }
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

    // Paginación. El pie (QR + huella) está anclado al fondo del documento
    // (margin-top:auto), pero al fondo del CONTENIDO. Dos ajustes:
    //  · Si el contenido se pasa de una página por POCO (≤ ~12 %), encogemos un
    //    pelín (uniforme, el QR sigue cuadrado) para que quepa en una página
    //    menos y no quede una última página casi en blanco.
    //  · Si de verdad necesita varias páginas, fijamos la altura a un nº ENTERO
    //    de páginas para que el pie caiga al fondo de la última (no flotando
    //    arriba de la siguiente).
    const pageHpx = (el.offsetWidth * 297) / 210; // alto de 1 página A4 al ancho renderizado
    // Guarda anti-cuelgue: si el host aún no tiene layout (offsetWidth 0), pageHpx
    // sería 0 → rawPages = Infinity → bucle infinito. Caemos a 1 página y topamos.
    const rawPages = pageHpx > 0 ? el.offsetHeight / pageHpx : 1;
    let numPages = Math.min(40, Math.max(1, Math.ceil(rawPages - 0.02)));
    const shrink = numPages > 1 && (numPages - 1) / rawPages >= 0.88; // cabe encogiendo ≤ ~12 %
    if (shrink) numPages -= 1;
    else if (pageHpx > 0) el.style.height = `${numPages * pageHpx}px`;

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

    // Render: en modo "encoger" se escala uniforme (QR cuadrado) y se centra;
    // si no, ocupa todo el ancho con la altura ya ajustada a páginas enteras.
    const totalH = shrink ? numPages * ph : imgH;
    const w = shrink ? (pw * numPages * ph) / imgH : pw;
    const x = (pw - w) / 2;
    for (let p = 0; p < numPages; p++) {
      if (p > 0) pdf.addPage();
      pdf.addImage(img, "PNG", x, -p * ph, w, totalH);
    }
    return new Uint8Array(pdf.output("arraybuffer"));
  } finally {
    document.body.removeChild(host);
  }
}
