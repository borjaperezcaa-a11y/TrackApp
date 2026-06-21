import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { nowMadrid } from "@/lib/format";
import { NumeracionForm } from "./NumeracionForm";

export const metadata = { title: "Numeración · TrackApp" };

export default async function NumeracionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("serie, num_inicial, num_inicial_anio, num_inicial_serie")
    .eq("user_id", user.id)
    .maybeSingle();

  const serie = (profile?.serie ?? "FACT").toUpperCase();
  const year = nowMadrid().year;

  const { data: last } = await supabase
    .from("invoices")
    .select("num")
    .eq("serie", serie)
    .eq("anio", year)
    .order("num", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ¿La serie ACTUAL+año ya tiene facturas? (Si las tiene, el "suelo" se ignora;
  // la serie en sí siempre se puede cambiar para empezar una nueva.)
  const serieTieneFacturas = last != null;

  const floorApplies =
    profile?.num_inicial != null &&
    profile?.num_inicial_anio === year &&
    (profile?.num_inicial_serie ?? "").toUpperCase() === serie;
  const numInicial = floorApplies ? Number(profile!.num_inicial) : 0;

  const maxNum = last?.num ?? 0;
  const nextNum = Math.max(maxNum, numInicial) + 1;
  const yy = String(year % 100).padStart(2, "0");
  const nextNumero = `${serie}/${yy}-${String(nextNum).padStart(2, "0")}`;

  return (
    <>
      <PageHeader title="Numeración" kicker="Ajustes · facturación" fallbackHref="/ajustes" />
      <p className="mb-4 px-1 text-[12.5px] text-dim">
        Serie y número con que se emiten tus facturas. La serie la puedes cambiar cuando quieras (empieza una nueva);
        el número de arranque solo se fija al estrenar una serie.
      </p>
      <NumeracionForm values={{ serie, numInicial, nextNumero, serieTieneFacturas }} />
    </>
  );
}
