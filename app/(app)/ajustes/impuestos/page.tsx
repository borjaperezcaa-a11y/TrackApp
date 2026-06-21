import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { ImpuestosForm } from "./ImpuestosForm";

export const metadata = { title: "Impuestos · TrackApp" };

export default async function ImpuestosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: p } = await supabase
    .from("profiles")
    .select("iva_def, irpf_def")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Impuestos por defecto" kicker="Ajustes · facturación" fallbackHref="/ajustes" />
      <p className="mb-4 px-1 text-[12.5px] text-dim">
        Se aplican por defecto al crear una factura. Puedes cambiarlos en cada factura antes de emitir.
      </p>
      <ImpuestosForm
        values={{
          iva_def: p?.iva_def != null ? Number(p.iva_def) : 21,
          irpf_def: p?.irpf_def != null ? Number(p.irpf_def) : 1,
        }}
      />
    </>
  );
}
