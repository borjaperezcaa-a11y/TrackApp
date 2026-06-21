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
    .select("logo_url, factura_plantilla")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Factura" kicker="Ajustes · diseño" fallbackHref="/ajustes" />
      <p className="mb-4 px-1 text-[12.5px] text-dim">
        Logo y estilo de tus PDFs. Los cambios se guardan al instante.
      </p>
      <FacturaForm
        userId={user.id}
        values={{
          logo_url: p?.logo_url ?? "",
          factura_plantilla: (p?.factura_plantilla as "trackapp" | "elegante" | "moderna") ?? "trackapp",
        }}
      />
    </>
  );
}
