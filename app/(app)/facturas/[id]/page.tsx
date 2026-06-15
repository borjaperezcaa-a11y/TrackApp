import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import type { Invoice, InvoiceLine } from "@/lib/types";
import { InvoiceDetailClient } from "./InvoiceDetailClient";

export const metadata = { title: "Factura · TrackApp" };

export default async function FacturaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Filtro explícito por user_id (además de RLS): defensa en profundidad.
  const { data: invoiceData } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!invoiceData) notFound();
  const invoice = invoiceData as Invoice;

  const { data: linesData } = await supabase
    .from("invoice_lines")
    .select("*")
    .eq("invoice_id", id)
    .eq("user_id", user.id)
    .order("orden");

  // ¿Esta factura ha sido anulada/rectificada por otra? (a lo sumo una, pero
  // limitamos para no romper si llegara a haber más de una fila).
  const { data: rectRows } = await supabase
    .from("invoices")
    .select("id, numero")
    .eq("rectifica_id", id)
    .eq("user_id", user.id)
    .order("emitida_at", { ascending: true })
    .limit(1);
  const rect = rectRows?.[0] ?? null;

  // Si esta factura ES una rectificativa, ¿a qué original referencia?
  let original: { id: string; numero: string } | null = null;
  if (invoice.rectifica_id) {
    const { data: orig } = await supabase
      .from("invoices")
      .select("id, numero")
      .eq("id", invoice.rectifica_id)
      .eq("user_id", user.id)
      .maybeSingle();
    original = orig ?? null;
  }

  return (
    <>
      <PageHeader title={invoice.numero} kicker="Factura" fallbackHref="/facturas" />
      <InvoiceDetailClient
        invoice={invoice}
        lines={(linesData ?? []) as InvoiceLine[]}
        annulledBy={rect ?? null}
        original={original}
      />
    </>
  );
}
