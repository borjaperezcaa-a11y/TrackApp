import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { FacturaForm } from "./FacturaForm";

export const metadata = { title: "Factura · TrackApp" };

export default async function FacturaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: p } = await supabase
    .from("profiles")
    .select("logo_url")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Factura" kicker="Ajustes · diseño" fallbackHref="/ajustes" />
      <p className="mb-4 px-1 text-[12.5px] text-dim">
        El logo que aparece en tus facturas. Se guarda al instante.
      </p>
      <FacturaForm userId={user.id} values={{ logo_url: p?.logo_url ?? "" }} />
    </>
  );
}
