import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/types";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { ClientForm } from "../ClientForm";
import { updateClientAction, deleteClientAction } from "../actions";

export const metadata = { title: "Editar cliente · TrackApp" };

export default async function EditarClientePage({
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
  const { data } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) notFound();
  const c = data as Client;

  return (
    <>
      <PageHeader title="Editar cliente" kicker="Clientes" fallbackHref="/clientes" />
      <ClientForm
        action={updateClientAction.bind(null, id)}
        values={{
          nombre: c.nombre ?? "",
          nif: c.nif ?? "",
          direccion: c.direccion ?? "",
          cp_localidad: c.cp_localidad ?? "",
          condiciones_pago: c.condiciones_pago ?? "",
          email: c.email ?? "",
        }}
        submitLabel="GUARDAR CAMBIOS"
      />
      <ConfirmDelete
        action={deleteClientAction.bind(null, id)}
        label="Borrar cliente"
        question="¿Seguro que quieres borrar este cliente?"
      />
    </>
  );
}
