import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { createClient } from "@/lib/supabase/server";
import type { Vehiculo } from "@/lib/types";
import { VehiculoForm } from "../VehiculoForm";
import { updateVehiculoAction, deleteVehiculoAction } from "../actions";

export const metadata = { title: "Editar camión · TrackApp" };

export default async function EditarCamionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("vehiculos")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) notFound();
  const v = data as Vehiculo;

  return (
    <>
      <PageHeader title="Editar camión" kicker="Camiones" fallbackHref="/camiones" />
      <VehiculoForm
        action={updateVehiculoAction.bind(null, id)}
        values={{ nombre: v.nombre ?? "", matricula: v.matricula ?? "" }}
        submitLabel="GUARDAR CAMBIOS"
      />
      <ConfirmDelete
        action={deleteVehiculoAction.bind(null, id)}
        label="Borrar camión"
        question="¿Borrar este camión? Los viajes que lo usaban quedarán sin camión asignado."
      />
    </>
  );
}
