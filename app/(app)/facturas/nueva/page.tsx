import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { NuevaFacturaWizard } from "./NuevaFacturaWizard";

export const metadata = { title: "Nueva factura · TrackApp" };

export default async function NuevaFacturaPage() {
  const supabase = await createClient();

  const [{ data: profile }, { data: clientsData }, { data: tripsData }] = await Promise.all([
    supabase.from("profiles").select("*").maybeSingle(),
    supabase.from("clients").select("id, nombre, nif, direccion, cp_localidad, condiciones_pago").order("nombre"),
    supabase
      .from("trips")
      .select("id, fecha, origen, destino, importe, client_id")
      .eq("estado", "pendiente")
      .order("fecha"),
  ]);

  return (
    <>
      <PageHeader title="Nueva factura" kicker="Desde viajes" fallbackHref="/facturas" />
      <NuevaFacturaWizard
        profile={{
          nombre: profile?.nombre ?? "",
          nif: profile?.nif ?? "",
          direccion: profile?.direccion ?? "",
          cp_localidad: profile?.cp_localidad ?? "",
          iban: profile?.iban ?? "",
          logo_url: profile?.logo_url ?? "",
          iva_def: profile?.iva_def != null ? Number(profile.iva_def) : 21,
          irpf_def: profile?.irpf_def != null ? Number(profile.irpf_def) : 1,
        }}
        clients={(clientsData ?? []).map((c) => ({
          id: c.id,
          nombre: c.nombre ?? "",
          nif: c.nif ?? "",
          direccion: c.direccion ?? "",
          cp_localidad: c.cp_localidad ?? "",
          condiciones_pago: c.condiciones_pago ?? "",
        }))}
        pendingTrips={(tripsData ?? []).map((t) => ({
          id: t.id,
          fecha: t.fecha,
          origen: t.origen ?? "",
          destino: t.destino ?? "",
          importe: Number(t.importe),
          client_id: t.client_id as string,
        }))}
      />
    </>
  );
}
