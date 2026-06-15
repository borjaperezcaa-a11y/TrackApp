import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { todayMadrid } from "@/lib/format";
import { TripForm } from "../TripForm";
import { createTripAction } from "../actions";

export const metadata = { title: "Nuevo viaje · TrackApp" };

export default async function NuevoViajePage() {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, nombre").order("nombre");
  const clients = data ?? [];

  return (
    <>
      <PageHeader title="Nuevo viaje" kicker="Viajes" fallbackHref="/viajes" />
      <TripForm
        action={createTripAction}
        clients={clients}
        values={{
          fecha: todayMadrid(),
          client_id: "",
          origen: "",
          destino: "",
          descripcion: "",
          peso: "",
          peso_unidad: "t",
          km: "",
          importe: "",
        }}
        submitLabel="GUARDAR VIAJE"
      />
    </>
  );
}
