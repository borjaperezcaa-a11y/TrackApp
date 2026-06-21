import { PageHeader } from "@/components/ui/PageHeader";
import { LoadError } from "@/components/ui/LoadError";
import { createClient } from "@/lib/supabase/server";
import { NuevaFacturaWizard } from "./NuevaFacturaWizard";

export const metadata = { title: "Nueva factura · TrackApp" };

export default async function NuevaFacturaPage() {
  const supabase = await createClient();

  const [
    { data: profile, error: profileErr },
    { data: clientsData, error: clientsErr },
    { data: tripsData, error: tripsErr },
    { count: emittedCount },
    { data: clausulaRow },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("nombre, nif, direccion, cp_localidad, iban, logo_url, iva_def, irpf_def, serie, factura_plantilla")
      .maybeSingle(),
    supabase.from("clients").select("id, nombre, nif, direccion, cp_localidad, condiciones_pago").order("nombre"),
    supabase
      .from("trips")
      .select("id, fecha, origen, destino, descripcion, importe, client_id")
      .eq("estado", "pendiente")
      .order("fecha"),
    supabase.from("invoices").select("id", { count: "exact", head: true }),
    // Cláusula aparte: degrada a vacío si la migración 0037 aún no está aplicada.
    supabase.from("profiles").select("clausula_activa, clausula_texto").maybeSingle(),
  ]);

  // Si aún no hay ninguna factura, esta sería la PRIMERA: avisaremos de que la
  // serie quedará fijada al emitirla.
  const esPrimeraFactura = (emittedCount ?? 0) === 0;
  const serie = (profile?.serie ?? "FACT").toUpperCase();

  // Un fallo de carga no debe disfrazarse de "no hay viajes": mostramos error con
  // reintento en lugar de un wizard vacío que llevaría a conclusiones equivocadas.
  if (profileErr || clientsErr || tripsErr) {
    return (
      <>
        <PageHeader title="Nueva factura" kicker="Desde viajes" fallbackHref="/facturas" />
        <LoadError />
      </>
    );
  }

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
          descripcion: t.descripcion ?? "",
          importe: Number(t.importe),
          client_id: t.client_id as string,
        }))}
        esPrimeraFactura={esPrimeraFactura}
        serie={serie}
        facturaPlantilla={(profile?.factura_plantilla as "trackapp" | "elegante" | "moderna") ?? "trackapp"}
        clausula={clausulaRow?.clausula_activa ? (clausulaRow?.clausula_texto ?? "") : ""}
      />
    </>
  );
}
