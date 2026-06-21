import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { DatosForm } from "./DatosForm";

export const metadata = { title: "Tus datos · TrackApp" };

export default async function DatosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: p } = await supabase
    .from("profiles")
    .select("nombre, nif, direccion, cp_localidad, iban, logo_url")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Mi perfil" kicker="Ajustes · emisor" fallbackHref="/ajustes" />
      <p className="mb-4 px-1 text-[12.5px] text-dim">
        Tus datos y tu logo rellenan automáticamente el emisor de tus facturas.
      </p>
      <DatosForm
        userId={user.id}
        values={{
          nombre: p?.nombre ?? "",
          nif: p?.nif ?? "",
          direccion: p?.direccion ?? "",
          cp_localidad: p?.cp_localidad ?? "",
          iban: p?.iban ?? "",
          logo_url: p?.logo_url ?? "",
        }}
      />
    </>
  );
}
