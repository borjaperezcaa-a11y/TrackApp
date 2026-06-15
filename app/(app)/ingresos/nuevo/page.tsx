import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { todayMadrid } from "@/lib/format";
import { IncomeForm } from "../IncomeForm";
import { createIncomeAction } from "../actions";

export const metadata = { title: "Nuevo ingreso · TrackApp" };

export default async function NuevoIngresoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Nuevo ingreso" kicker="Ingresos" fallbackHref="/ingresos" />
      <IncomeForm
        action={createIncomeAction}
        submitLabel="GUARDAR INGRESO"
        values={{
          concepto: "",
          cliente: "",
          fecha: todayMadrid(),
          base: "",
          iva_rate: "21",
          iva: "",
          total: "",
          cobrada: true,
        }}
      />
    </>
  );
}
