import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { ClausulaForm } from "./ClausulaForm";

export const metadata = { title: "Cláusula de condiciones · TrackApp" };

export default async function ClausulaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: p } = await supabase
    .from("profiles")
    .select("clausula_activa, clausula_texto")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Cláusula de condiciones" kicker="Ajustes · facturación" fallbackHref="/ajustes" />
      <p className="mb-4 px-1 text-[12.5px] text-dim">
        Texto de condiciones que aparece al pie de tus facturas. Es una nota comercial (no fiscal): no afecta a la
        huella ni al registro Verifactu.
      </p>
      <ClausulaForm
        values={{
          activa: p?.clausula_activa ?? true,
          texto: p?.clausula_texto ?? "",
        }}
      />
    </>
  );
}
