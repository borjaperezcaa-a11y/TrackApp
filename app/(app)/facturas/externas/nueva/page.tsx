import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { dateISO } from "@/lib/format";
import { ExternalInvoiceForm } from "../ExternalInvoiceForm";
import { createExternalInvoiceAction } from "../actions";

export const metadata = { title: "Registrar factura de cooperativa · TrackApp" };

export default async function NuevaFacturaExternaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Factura de cooperativa" kicker="Registrar" fallbackHref="/facturas/externas" />
      <ExternalInvoiceForm
        userId={user.id}
        action={createExternalInvoiceAction}
        submitLabel="GUARDAR FACTURA"
        values={{
          fuente: "cooperativa",
          numero: "",
          fecha: dateISO(new Date()),
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
