import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { dateISO } from "@/lib/format";
import { ExpenseForm } from "../ExpenseForm";
import { createExpenseAction } from "../actions";

export const metadata = { title: "Nuevo gasto · TrackApp" };

export default async function NuevoGastoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Nuevo gasto" kicker="Gastos" fallbackHref="/gastos" />
      <ExpenseForm
        userId={user.id}
        action={createExpenseAction}
        submitLabel="GUARDAR GASTO"
        values={{
          categoria: "Gasoil",
          estacion: "",
          fecha: dateISO(new Date()),
          base: "",
          iva: "",
          total: "",
          foto_path: null,
        }}
      />
    </>
  );
}
