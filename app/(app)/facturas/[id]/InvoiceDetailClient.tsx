"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { clsx } from "@/lib/clsx";
import { eur, amount, dateES } from "@/lib/format";
import { computeInvoiceTotals } from "@/lib/invoice";
import { triggerDownload } from "@/lib/download";
import { verifyInvoice, type HuellaInput } from "@/lib/verifactu";
import type { Invoice, InvoiceLine } from "@/lib/types";
import { togglePaidAction, emitRectificativaAction, emitRectificativaDifAction } from "../actions";

type Ref = { id: string; numero: string } | null;

// ── Envío de factura por email ───────────────────────────────────────────────
// EN PRUEBAS: el envío por correo está DESACTIVADO a propósito (no se manda nada).
// Para ACTIVARLO cuando se quiera: pon esto a `true` y añade el `onClick` del botón
// que llame a un server action de envío con el PDF y `clienteEmail`.
const ENVIO_EMAIL_ACTIVO = false;

export function InvoiceDetailClient({
  invoice,
  lines,
  annulledBy,
  original,
  profileLogoUrl,
  facturaPlantilla = "trackapp",
  clienteEmail = null,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  annulledBy: Ref;
  original: Ref;
  profileLogoUrl?: string | null;
  facturaPlantilla?: "trackapp" | "elegante" | "moderna";
  clienteEmail?: string | null;
}) {
  const router = useRouter();
  const em = invoice.emisor_snapshot;
  const cl = invoice.cliente_snapshot;
  const esRectificativa = invoice.tipo !== "F1";

  const [qr, setQr] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [pagada, setPagada] = useState(invoice.pagada);
  const [pending, startTransition] = useTransition();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Flujo de rectificativa
  const [rectMode, setRectMode] = useState<null | "menu" | "corregir" | "anular">(null);
  const [motivo, setMotivo] = useState("");
  const [precios, setPrecios] = useState<string[]>(() => lines.map((l) => String(Number(l.precio))));
  const [rectBusy, rectStart] = useTransition();
  const [rectError, setRectError] = useState<string | null>(null);
  const rectInFlight = useRef(false); // guard anti doble-emisión de rectificativa
  const pdfUrlRef = useRef<string | null>(null); // URL del PDF en curso (se revoca al regenerar/desmontar)

  // Revoca la URL del PDF al desmontar (evita fugas sin cortar la previsualización antes de tiempo).
  useEffect(() => () => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
  }, []);

  function resetRect() {
    setRectMode(null);
    setRectError(null);
    setMotivo("");
    setPrecios(lines.map((l) => String(Number(l.precio))));
  }

  function anular() {
    setRectError(null);
    if (rectInFlight.current) return;
    rectInFlight.current = true;
    rectStart(async () => {
      try {
        const res = await emitRectificativaAction(invoice.id, motivo);
        if (res.error) setRectError(res.error);
        else if (res.invoiceId) router.push(`/facturas/${res.invoiceId}`);
      } finally {
        rectInFlight.current = false;
      }
    });
  }

  function corregir() {
    setRectError(null);
    if (rectInFlight.current) return;
    rectInFlight.current = true;
    const corrLines = lines.map((l, i) => ({
      cantidad: Number(l.cantidad) || 0,
      precio: Number(precios[i]) || 0,
    }));
    rectStart(async () => {
      try {
        const res = await emitRectificativaDifAction(invoice.id, corrLines, motivo);
        if (res.error) setRectError(res.error);
        else if (res.invoiceId) router.push(`/facturas/${res.invoiceId}`);
      } finally {
        rectInFlight.current = false;
      }
    });
  }

  // Totales corregidos (previsualización de la rectificativa por diferencias)
  const corrected = computeInvoiceTotals(
    lines.map((l, i) => ({ cantidad: Number(l.cantidad) || 0, precio: Number(precios[i]) || 0 })),
    Number(invoice.iva_rate),
    Number(invoice.irpf_rate),
  );
  const diffTotal = corrected.total - Number(invoice.total);

  // QR (carga diferida de qrcode)
  useEffect(() => {
    let alive = true;
    if (invoice.qr) {
      import("qrcode")
        .then((m) => m.default.toDataURL(invoice.qr!, { margin: 1, width: 240 }))
        .then((d) => {
          if (alive) setQr(d);
        })
        .catch(() => {
          // El QR es decorativo: si falla la carga del chunk (offline) no rompemos la página.
        });
    }
    return () => {
      alive = false;
    };
  }, [invoice.qr]);

  // Verificación de la huella encadenada (recalculada en el cliente)
  useEffect(() => {
    const input: HuellaInput = {
      emisorNif: em?.nif ?? "",
      numero: invoice.numero,
      fechaExpedicion: invoice.fecha,
      cuotaTotal: Number(invoice.iva),
      importeTotal: Number(invoice.total),
      huellaAnterior: invoice.prev_hash,
      genTs: new Date(invoice.gen_ts),
      tipoFactura: invoice.tipo,
    };
    verifyInvoice(input, invoice.huella).then(setVerified);
  }, [invoice, em]);

  function togglePaid() {
    setPayError(null);
    startTransition(async () => {
      try {
        const r = await togglePaidAction(invoice.id, !pagada);
        if (r.error) setPayError(r.error);
        else setPagada(!pagada);
      } catch {
        setPayError("No se pudo actualizar el cobro. Comprueba tu conexión e inténtalo de nuevo.");
      }
    });
  }

  const pdfFilename = `Factura ${invoice.numero.replace(/\//g, "-")}.pdf`;

  async function buildPdfFile(): Promise<File> {
    const { buildInvoicePdf } = await import("@/lib/pdf/invoice-pdf");
    // Si la factura no grabó logo (emitida antes de tenerlo), usa el del perfil actual.
    const emisor = {
      ...invoice.emisor_snapshot,
      logo_url: invoice.emisor_snapshot?.logo_url || profileLogoUrl || null,
    };
    const bytes = await buildInvoicePdf({ ...invoice, pagada, emisor_snapshot: emisor }, lines, facturaPlantilla);
    return new File([bytes as unknown as BlobPart], pdfFilename, { type: "application/pdf" });
  }

  // "Descargar PDF": descarga el archivo con el nombre "Factura FACT-26-08.pdf"
  // (la descarga directa respeta el nombre; abrir un blob en pestaña no lo haría).
  function openPdf() {
    setPdfBusy(true);
    setPdfError(null);
    buildPdfFile()
      .then((file) => {
        if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); // libera el anterior
        const url = URL.createObjectURL(file);
        pdfUrlRef.current = url;
        triggerDownload(url, file.name);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[PDF] error:", e);
        setPdfError(`No se pudo generar el PDF: ${msg}`);
      })
      .finally(() => setPdfBusy(false));
  }

  // Compartir por WhatsApp / email / Telegram… con la hoja de compartir nativa.
  async function sharePdf() {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const file = await buildPdfFile();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Factura ${invoice.numero}` });
      } else {
        const url = URL.createObjectURL(file);
        triggerDownload(url, file.name);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch {
      /* cancelado o no soportado: no es un error */
    } finally {
      setPdfBusy(false);
    }
  }

  const baseIva = Number(invoice.base) + Number(invoice.iva);

  return (
    <div className="stagger pb-4">
      {/* Resumen */}
      <Card className="mb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-dim">
              {cl?.nombre ?? "Cliente"}
            </div>
            <div className="font-display text-2xl font-bold">{invoice.numero}</div>
            <div className="mt-0.5 text-[12.5px] text-dim">{dateES(invoice.fecha)}</div>
          </div>
          <Badge tone={pagada ? "good" : "mid"}>{pagada ? "Cobrada" : "Pendiente de cobro"}</Badge>
        </div>
        <div className="mt-3 font-display text-3xl font-bold text-amber tnum">
          {eur(Number(invoice.total))}
        </div>
      </Card>

      {esRectificativa && (
        <p className="mb-3.5 rounded-2xl border border-amber-line bg-amber-soft px-4 py-3 text-[12.5px] font-semibold text-amber">
          Factura RECTIFICATIVA (anulación)
          {original && (
            <>
              {" "}
              de la{" "}
              <Link href={`/facturas/${original.id}`} className="underline">
                {original.numero}
              </Link>
            </>
          )}
          . Sus importes están en negativo para dejar la original a cero.
          {invoice.motivo ? ` Motivo: ${invoice.motivo}` : ""}
        </p>
      )}

      {annulledBy && (
        <p className="mb-3.5 rounded-2xl border border-red/40 bg-red-soft px-4 py-3 text-[12.5px] font-semibold text-red">
          Esta factura fue anulada por la rectificativa{" "}
          <Link href={`/facturas/${annulledBy.id}`} className="underline">
            {annulledBy.numero}
          </Link>
          .
        </p>
      )}

      {/* Portes */}
      <div className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">
        Portes ({lines.length})
      </div>
      <Card soft className="mb-3.5 !p-3">
        {lines.map((ln) => (
          <div
            key={ln.id}
            className="flex items-center gap-2 border-b border-line py-2 text-[13px] last:border-0"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {ln.origen} → {ln.destino}
              </div>
              <div className="text-[11.5px] text-dim">
                {ln.fecha ? dateES(ln.fecha) : ""} · {amount(Number(ln.cantidad))} ×{" "}
                {amount(Number(ln.precio))}
              </div>
            </div>
            <div className="font-display font-bold tnum">{eur(Number(ln.importe))}</div>
          </div>
        ))}
      </Card>

      {/* Totales */}
      <Card soft className="mb-3.5">
        <Line label="Base imponible" value={eur(Number(invoice.base))} />
        <Line label={`IVA ${amount(Number(invoice.iva_rate))}%`} value={eur(Number(invoice.iva))} />
        <Line label="Subtotal" value={eur(baseIva)} muted />
        {Number(invoice.irpf) > 0 && (
          <Line label={`Retención IRPF ${amount(Number(invoice.irpf_rate))}%`} value={`− ${eur(Number(invoice.irpf))}`} />
        )}
        <div className="mt-1.5 flex items-center justify-between border-t border-dashed border-line pt-2.5 font-bold">
          <span>Total factura</span>
          <b className="font-display text-2xl text-amber tnum">{eur(Number(invoice.total))}</b>
        </div>
      </Card>

      {/* Verifactu: huella + QR */}
      <Card className="mb-3.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-dim">
            Huella Verifactu
          </span>
          {verified === null ? (
            <span className="text-xs text-dim">verificando…</span>
          ) : verified ? (
            <Badge tone="good">Cadena íntegra ✓</Badge>
          ) : (
            <Badge tone="bad">No verificada</Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {qr && (
            <Image
              src={qr}
              alt="QR de verificación"
              width={92}
              height={92}
              unoptimized
              className="flex-none rounded-lg bg-white p-1"
            />
          )}
          <code className="break-all text-[10.5px] leading-snug text-dim">{invoice.huella}</code>
        </div>
      </Card>

      <p className="mb-3.5 rounded-2xl border border-amber-line bg-amber-soft px-4 py-3 text-[12px] font-semibold text-amber">
        Aún NO es una factura oficial Verifactu: la huella y el QR se generan, pero no se ha enviado
        a la AEAT ni firmado con certificado digital.
      </p>

      {/* Acciones */}
      <button
        type="button"
        onClick={openPdf}
        disabled={pdfBusy}
        className="flex min-h-[60px] w-full items-center justify-center gap-2.5 rounded-[18px] bg-amber px-5 py-4 text-[16px] font-extrabold text-[#1a1205] transition-transform active:scale-[0.97] disabled:opacity-60"
      >
        <Icon name="doc" size={20} /> {pdfBusy ? "Generando PDF…" : "Descargar PDF"}
      </button>
      <button
        type="button"
        onClick={sharePdf}
        disabled={pdfBusy}
        className="mt-2.5 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[18px] border border-line bg-panel py-4 text-[15px] font-bold text-text transition-transform active:scale-[0.97] disabled:opacity-60"
      >
        <Icon name="send" size={18} /> Compartir
      </button>
      {pdfError && (
        <p className="mt-2 rounded-xl bg-red-soft px-3 py-2 text-center text-sm font-semibold text-red">
          {pdfError}
        </p>
      )}

      {/* Enviar por email — PREPARADO pero DESACTIVADO (estamos en pruebas).
          Para activarlo: cambia ENVIO_EMAIL_ACTIVO a true (arriba) y conecta el
          envío real (p. ej. un server action que mande el PDF a `clienteEmail`). */}
      <button
        type="button"
        disabled={!ENVIO_EMAIL_ACTIVO || !clienteEmail}
        aria-disabled={!ENVIO_EMAIL_ACTIVO || !clienteEmail}
        title={
          clienteEmail
            ? `Se enviará a ${clienteEmail}${ENVIO_EMAIL_ACTIVO ? "" : " (envío aún no activado)"}`
            : "Añade el correo del cliente en su ficha"
        }
        className="mt-2.5 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[18px] border border-line bg-panel py-4 text-[15px] font-bold text-dim transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon name="send" size={18} /> Enviar por email
      </button>
      <p className="mt-1 px-1 text-center text-[11.5px] text-dim">
        {clienteEmail ? (
          <>
            Listo para enviar a <b className="text-text">{clienteEmail}</b>. Envío aún desactivado (en pruebas).
          </>
        ) : (
          <>
            Para enviarla por correo, añade el email del cliente en su{" "}
            <Link href={`/clientes/${invoice.client_id}`} className="underline">
              ficha
            </Link>
            .
          </>
        )}
      </p>

      <button
        type="button"
        onClick={togglePaid}
        disabled={pending}
        className={clsx(
          "mt-2.5 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[18px] border py-4 text-[15px] font-bold transition-transform active:scale-[0.97] disabled:opacity-60",
          pagada
            ? "border-line bg-panel text-dim"
            : "border-green/40 bg-green-soft text-green",
        )}
      >
        <Icon name="check" size={18} />
        {pagada ? "Marcar como pendiente" : "Marcar como cobrada"}
      </button>
      {payError && (
        <p className="mt-2 rounded-xl bg-red-soft px-3 py-2 text-center text-sm font-semibold text-red">
          {payError}
        </p>
      )}

      {/* Rectificativa: solo en facturas normales no rectificadas */}
      {!esRectificativa && !annulledBy && (
        <div className="mt-6 border-t border-line pt-4">
          {rectMode === null && (
            <>
              <button
                type="button"
                onClick={() => setRectMode("menu")}
                className="w-full rounded-[18px] border border-amber-line bg-amber-soft py-4 text-sm font-bold text-amber transition-transform active:scale-[0.97]"
              >
                Rectificar esta factura
              </button>
              <p className="mt-2 px-1 text-center text-[11.5px] text-dim">
                Una factura emitida no se edita ni se borra: se corrige con una factura rectificativa
                que la referencia y se encadena con su huella.
              </p>
            </>
          )}

          {rectMode === "menu" && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setRectMode("corregir")}
                className="w-full rounded-[16px] border border-line bg-panel px-4 py-3.5 text-left"
              >
                <div className="text-sm font-bold">Corregir importe (por diferencias)</div>
                <div className="mt-0.5 text-[12px] text-dim">
                  Ajusta el <b>precio</b> de los portes; se emite una rectificativa solo por la
                  diferencia. La original sigue válida. <b>No cambia el IVA ni el IRPF.</b>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRectMode("anular")}
                className="w-full rounded-[16px] border border-line bg-panel px-4 py-3.5 text-left"
              >
                <div className="text-sm font-bold text-red">Anular la factura</div>
                <div className="mt-0.5 text-[12px] text-dim">
                  La deja a cero (importes en negativo) y libera sus viajes. Úsala si te equivocaste
                  en el <b>IVA / IRPF</b>, en el cliente o en algo de fondo: anula y vuelve a emitir
                  una factura nueva correcta.
                </div>
              </button>
              <button
                type="button"
                onClick={resetRect}
                className="w-full rounded-[16px] border border-line bg-panel py-3 text-sm font-bold text-dim"
              >
                Cancelar
              </button>
            </div>
          )}

          {rectMode === "corregir" && (
            <div>
              <p className="mb-1 text-sm font-bold">Corregir importe</p>
              <p className="mb-2.5 text-[12px] text-dim">
                Solo cambia el <b>precio</b> de cada porte. Si el error es del <b>IVA o IRPF</b>,
                vuelve atrás y usa <b>Anular</b> para reemitir con el tipo correcto.
              </p>
              <div className="space-y-2">
                {lines.map((ln, i) => (
                  <div key={ln.id} className="flex items-center gap-2 text-[13px]">
                    <div className="min-w-0 flex-1 truncate">
                      {ln.origen} → {ln.destino}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={precios[i]}
                      onChange={(e) =>
                        setPrecios((p) => p.map((v, idx) => (idx === i ? e.target.value : v)))
                      }
                      className="w-28 rounded-lg border-[1.5px] border-line bg-panel px-2.5 py-2 text-right font-display text-base outline-none focus:border-amber"
                    />
                  </div>
                ))}
              </div>

              <Card soft className="my-3">
                <Line label="Total original" value={eur(Number(invoice.total))} muted />
                <Line label="Total corregido" value={eur(corrected.total)} />
                <div className="mt-1.5 flex items-center justify-between border-t border-dashed border-line pt-2 font-bold">
                  <span>Diferencia (rectificativa)</span>
                  <b className={clsx("font-display tnum", diffTotal < 0 ? "text-red" : "text-green")}>
                    {diffTotal >= 0 ? "+" : ""}
                    {eur(diffTotal)}
                  </b>
                </div>
              </Card>

              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo (opcional): error en el precio del porte…"
                className="min-h-[60px] w-full rounded-xl border-[1.5px] border-line bg-panel px-3.5 py-3 text-sm font-medium outline-none focus:border-amber"
              />
              {rectError && (
                <p className="mt-2 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
                  {rectError}
                </p>
              )}
              <div className="mt-2.5 flex gap-2.5">
                <button
                  type="button"
                  onClick={resetRect}
                  className="flex-1 rounded-[18px] border border-line bg-panel py-4 text-sm font-bold text-text"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={corregir}
                  disabled={rectBusy || diffTotal === 0}
                  className="flex-1 rounded-[18px] bg-amber py-4 text-sm font-extrabold text-[#1a1205] transition-transform active:scale-[0.97] disabled:opacity-60"
                >
                  {rectBusy ? "Emitiendo…" : "Emitir rectificativa"}
                </button>
              </div>
            </div>
          )}

          {rectMode === "anular" && (
            <div>
              <p className="mb-2 text-sm font-bold">Anular la factura</p>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo (opcional): factura emitida por error, cliente incorrecto…"
                className="min-h-[70px] w-full rounded-xl border-[1.5px] border-line bg-panel px-3.5 py-3 text-sm font-medium outline-none focus:border-amber"
              />
              {rectError && (
                <p className="mt-2 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
                  {rectError}
                </p>
              )}
              <div className="mt-2.5 flex gap-2.5">
                <button
                  type="button"
                  onClick={resetRect}
                  className="flex-1 rounded-[18px] border border-line bg-panel py-4 text-sm font-bold text-text"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={anular}
                  disabled={rectBusy}
                  className="flex-1 rounded-[18px] bg-red py-4 text-sm font-extrabold text-white transition-transform active:scale-[0.97] disabled:opacity-60"
                >
                  {rectBusy ? "Anulando…" : "Emitir anulación"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={clsx("flex items-center justify-between py-1 text-sm", muted ? "text-dim" : "text-dim")}>
      <span>{label}</span>
      <b className={clsx("tnum", muted ? "text-dim" : "text-text")}>{value}</b>
    </div>
  );
}
