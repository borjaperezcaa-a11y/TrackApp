import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { todayMadrid } from "@/lib/format";
import { routingEnabled } from "@/lib/routing";
import { ViajeForm } from "../ViajeForm";

export const metadata = { title: "Nuevo viaje · TrackApp" };

export default async function NuevoViajePage() {
  const supabase = await createClient();
  const [{ data }, { data: vehiculosData }] = await Promise.all([
    supabase.from("clients").select("id, nombre").order("nombre"),
    supabase.from("vehiculos").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  return (
    <>
      <PageHeader title="Nuevo viaje" kicker="Viajes" fallbackHref="/viajes" />
      <ViajeForm
        clients={data ?? []}
        vehiculos={vehiculosData ?? []}
        defaultFecha={todayMadrid()}
        routingEnabled={routingEnabled()}
      />
    </>
  );
}
