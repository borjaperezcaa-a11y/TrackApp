import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/types";
import { ClientForm } from "../ClientForm";
import { DeleteClientButton } from "../DeleteClientButton";
import { updateClientAction } from "../actions";

export const metadata = { title: "Editar cliente · TrackApp" };

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
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
        }}
        submitLabel="GUARDAR CAMBIOS"
      />
      <DeleteClientButton id={id} />
    </>
  );
}
