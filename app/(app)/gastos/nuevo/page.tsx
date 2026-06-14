import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { dateISO, dateES } from "@/lib/format";
import { ExpenseForm } from "../ExpenseForm";
import { createExpenseAction } from "../actions";

export const metadata = { title: "Nuevo gasto · TrackApp" };

export default async function NuevoGastoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tripsData } = await supabase
    .from("trips")
    .select("id, fecha, origen, destino")
    .order("fecha", { ascending: false })
    .limit(50);

  const trips = (tripsData ?? []).map((t) => ({
    id: t.id,
    label: `${dateES(t.fecha)} · ${t.origen ?? ""} → ${t.destino ?? ""}`.trim(),
  }));

  return (
    <>
      <PageHeader title="Nuevo gasto" kicker="Gastos" fallbackHref="/gastos" />
      <ExpenseForm
        userId={user.id}
        trips={trips}
        action={createExpenseAction}
        submitLabel="GUARDAR GASTO"
        values={{
          categoria: "Gasoil",
          estacion: "",
          fecha: dateISO(new Date()),
          base: "",
          iva: "",
          total: "",
          trip_id: "",
          foto_path: null,
        }}
      />
    </>
  );
}
