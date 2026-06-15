import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { createClient } from "@/lib/supabase/server";
import { ExternalInvoiceForm } from "../ExternalInvoiceForm";
import { updateExternalInvoiceAction, deleteExternalInvoiceAction } from "../actions";
import type { ExternalInvoice } from "@/lib/types";

export const metadata = { title: "Editar factura de cooperativa · TrackApp" };

export default async function EditarFacturaExternaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("external_invoices").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const f = data as ExternalInvoice;

  // URL firmada para abrir el archivo guardado (bucket privado).
  let archivoUrl: string | null = null;
  if (f.archivo_url) {
    const { data: signed } = await supabase.storage.from("facturas").createSignedUrl(f.archivo_url, 120);
    archivoUrl = signed?.signedUrl ?? null;
  }

  return (
    <>
      <PageHeader title="Editar factura" kicker="Cooperativa" fallbackHref="/facturas/externas" />
      {archivoUrl && (
        <Link
          href={archivoUrl}
          target="_blank"
          className="mb-3.5 inline-flex items-center gap-2 rounded-2xl border border-line bg-panel px-4 py-3 text-[13px] font-bold text-amber"
        >
          Ver archivo adjunto ›
        </Link>
      )}
      <ExternalInvoiceForm
        userId={user.id}
        action={updateExternalInvoiceAction.bind(null, id)}
        submitLabel="GUARDAR CAMBIOS"
        values={{
          fuente: f.fuente,
          numero: f.numero,
          fecha: f.fecha,
          cliente: f.cliente ?? "",
          cliente_nif: f.cliente_nif ?? "",
          concepto: f.concepto ?? "",
          base: String(f.base),
          iva_rate: f.iva_rate != null ? String(f.iva_rate) : "21",
          iva: String(f.iva),
          irpf_rate: f.irpf_rate != null ? String(f.irpf_rate) : "0",
          irpf: String(f.irpf),
          cobrada: f.cobrada,
          archivo_path: f.archivo_url,
        }}
      />
      <ConfirmDelete
        action={deleteExternalInvoiceAction.bind(null, id)}
        label="Borrar factura"
        question="¿Seguro que quieres borrar esta factura registrada?"
      />
    </>
  );
}
