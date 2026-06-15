import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { todayMadrid } from "@/lib/format";
import { serieFromNumero } from "@/lib/external-invoice";
import { ExternalInvoiceForm } from "../ExternalInvoiceForm";
import { createExternalInvoiceAction } from "../actions";

export const metadata = { title: "Registrar factura externa · TrackApp" };

export default async function NuevaFacturaExternaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Series ya conocidas (prefijo del número → nombre) para autorrellenar.
  const { data: existing } = await supabase.from("external_invoices").select("numero, serie");
  const knownSeries: Record<string, string> = {};
  for (const r of existing ?? []) {
    const pref = serieFromNumero(r.numero as string);
    if (pref && r.serie) knownSeries[pref] = r.serie as string;
  }

  return (
    <>
      <PageHeader title="Factura externa" kicker="Registrar" fallbackHref="/facturas/externas" />
      <ExternalInvoiceForm
        userId={user.id}
        action={createExternalInvoiceAction}
        submitLabel="GUARDAR FACTURA"
        knownSeries={knownSeries}
        scanEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
        values={{
          serie: "",
          numero: "",
          fecha: todayMadrid(),
          cliente: "",
          cliente_nif: "",
          concepto: "",
          base: "",
          iva_rate: "21",
          iva: "",
          irpf_rate: "0",
          irpf: "",
          cobrada: false,
          archivo_path: null,
        }}
      />
    </>
  );
}
