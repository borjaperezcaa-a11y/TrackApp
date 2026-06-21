import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { nowMadrid } from "@/lib/format";
import { NumeracionForm } from "./NumeracionForm";
import { ClausulaForm } from "./ClausulaForm";

export const metadata = { title: "Factura · TrackApp" };

export default async function FacturaPage() {
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

  // Cláusula aparte: degrada si la migración 0037 aún no está aplicada.
  const { data: cl } = await supabase
    .from("profiles")
    .select("clausula_activa, clausula_texto")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Factura" kicker="Ajustes" fallbackHref="/ajustes" />

      <h2 className="mb-2 mt-1 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Numeración</h2>
      <p className="mb-3 px-1 text-[12.5px] text-dim">
        Serie y número con que se emiten tus facturas. La serie la puedes cambiar cuando quieras (empieza una nueva);
        el número de arranque solo se fija al estrenar una serie.
      </p>
      <NumeracionForm values={{ serie, numInicial, nextNumero, serieTieneFacturas }} />

      <h2 className="mb-2 mt-7 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Cláusula de condiciones</h2>
      <p className="mb-3 px-1 text-[12.5px] text-dim">
        Texto de condiciones al pie de tus facturas. Es una nota comercial (no fiscal): no afecta a la huella ni al
        registro Verifactu.
      </p>
      <ClausulaForm values={{ activa: cl?.clausula_activa ?? true, texto: cl?.clausula_texto ?? "" }} />
    </>
  );
}
