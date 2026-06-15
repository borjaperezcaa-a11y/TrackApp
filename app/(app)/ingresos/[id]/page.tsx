import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { createClient } from "@/lib/supabase/server";
import { IncomeForm } from "../IncomeForm";
import { updateIncomeAction, deleteIncomeAction } from "../actions";
import type { Income } from "@/lib/types";

export const metadata = { title: "Editar ingreso · TrackApp" };

export default async function EditarIngresoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("incomes")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) notFound();
  const i = data as Income;

  const { data: clientsData } = await supabase.from("clients").select("nombre").order("nombre");
  const clients = (clientsData ?? []).map((c) => c.nombre as string).filter(Boolean);

  return (
    <>
      <PageHeader title="Editar ingreso" kicker="Ingresos" fallbackHref="/ingresos" />
      <IncomeForm
        action={updateIncomeAction.bind(null, id)}
        submitLabel="GUARDAR CAMBIOS"
        clients={clients}
        values={{
          concepto: i.concepto ?? "",
          cliente: i.cliente ?? "",
          fecha: i.fecha ?? "",
          base: i.base != null ? String(i.base) : "",
          iva_rate: i.iva_rate != null ? String(i.iva_rate) : "21",
          iva: i.iva != null ? String(i.iva) : "",
          total: String(i.total),
          cobrada: i.cobrada,
        }}
      />
      <ConfirmDelete
        action={deleteIncomeAction.bind(null, id)}
        label="Borrar ingreso"
        question="¿Seguro que quieres borrar este ingreso?"
      />
    </>
  );
}
