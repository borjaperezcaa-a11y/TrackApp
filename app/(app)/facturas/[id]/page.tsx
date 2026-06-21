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

  // Logo actual del perfil: respaldo para facturas emitidas antes de tener logo
  // (el logo es branding, no dato fiscal; los importes/huella siguen del snapshot).
  const { data: prof } = await supabase
    .from("profiles")
    .select("logo_url, factura_plantilla")
    .maybeSingle();
  const profileLogoUrl = (prof?.logo_url as string | null) ?? null;
  const facturaPlantilla = (prof?.factura_plantilla as "trackapp" | "elegante" | "moderna") ?? "trackapp";
  // Cláusula de condiciones (consulta aparte: degrada a vacío si la migración
  // 0037 aún no está aplicada, sin romper la página).
  const { data: cl } = await supabase.from("profiles").select("clausula_activa, clausula_texto").maybeSingle();
  const clausula = cl?.clausula_activa ? ((cl?.clausula_texto as string | null) ?? "") : "";

  // Email actual del cliente (para el botón "Enviar por email", aún desactivado).
  let clienteEmail: string | null = null;
  if (invoice.client_id) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("email")
      .eq("id", invoice.client_id)
      .eq("user_id", user.id)
      .maybeSingle();
    clienteEmail = (clientRow?.email as string | null) ?? null;
  }

  return (
    <>
      <PageHeader title={invoice.numero} kicker="Factura" fallbackHref="/facturas" />
      <InvoiceDetailClient
        invoice={invoice}
        lines={(linesData ?? []) as InvoiceLine[]}
        annulledBy={rect ?? null}
        original={original}
        profileLogoUrl={profileLogoUrl}
        facturaPlantilla={facturaPlantilla}
        clienteEmail={clienteEmail}
        clausula={clausula}
      />
    </>
  );
}
