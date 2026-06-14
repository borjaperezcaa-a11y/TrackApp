"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { clsx } from "@/lib/clsx";
import { eur, amount, dateES } from "@/lib/format";
import { verifyInvoice, type HuellaInput } from "@/lib/verifactu";
import type { Invoice, InvoiceLine } from "@/lib/types";
import { togglePaidAction } from "../actions";

export function InvoiceDetailClient({ invoice, lines }: { invoice: Invoice; lines: InvoiceLine[] }) {
  const em = invoice.emisor_snapshot;
  const cl = invoice.cliente_snapshot;

  const [qr, setQr] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [pagada, setPagada] = useState(invoice.pagada);
  const [pending, startTransition] = useTransition();
  const [pdfBusy, setPdfBusy] = useState(false);

  // QR (carga diferida de qrcode)
  useEffect(() => {
    let alive = true;
    if (invoice.qr) {
      import("qrcode").then((m) =>
        m.default.toDataURL(invoice.qr!, { margin: 1, width: 240 }).then((d) => {
          if (alive) setQr(d);
        }),
      );
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
    };
    verifyInvoice(input, invoice.huella).then(setVerified);
  }, [invoice, em]);

  function togglePaid() {
    startTransition(async () => {
      const r = await togglePaidAction(invoice.id, !pagada);
      if (!r.error) setPagada(!pagada);
    });
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const { buildInvoicePdf } = await import("@/lib/pdf/invoice-pdf");
      const bytes = await buildInvoicePdf({ ...invoice, pagada }, lines);
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.numero.replace(/\//g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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
          <Badge tone={pagada ? "good" : "mid"}>{pagada ? "Cobrada" : "Pendiente"}</Badge>
        </div>
        <div className="mt-3 font-display text-3xl font-bold text-amber tnum">
          {eur(Number(invoice.total))}
        </div>
      </Card>

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
        onClick={downloadPdf}
        disabled={pdfBusy}
        className="flex min-h-[60px] w-full items-center justify-center gap-2.5 rounded-[18px] bg-amber px-5 py-4 text-[16px] font-extrabold text-[#1a1205] transition-transform active:scale-[0.97] disabled:opacity-60"
      >
        <Icon name="save" size={20} /> {pdfBusy ? "Generando PDF…" : "Descargar PDF"}
      </button>

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
