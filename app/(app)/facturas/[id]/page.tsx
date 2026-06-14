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

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!invoice) notFound();

  const { data: linesData } = await supabase
    .from("invoice_lines")
    .select("*")
    .eq("invoice_id", id)
    .order("orden");

  return (
    <>
      <PageHeader title={(invoice as Invoice).numero} kicker="Factura" fallbackHref="/facturas" />
      <InvoiceDetailClient invoice={invoice as Invoice} lines={(linesData ?? []) as InvoiceLine[]} />
    </>
  );
}
