import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/server";
import { nowMadrid } from "@/lib/format";
import { ProfileForm, type ProfileValues } from "./ProfileForm";

export const metadata = { title: "Mis datos · TrackApp" };

export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // el layout ya redirige; esto narra el tipo

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const serie = (profile?.serie ?? "FACT").toUpperCase();
  // Año en zona España: debe coincidir con extract(year from current_date) de
  // Postgres al emitir, o el "suelo" de numeración no aplicaría en la frontera.
  const year = nowMadrid().year;

  const { data: last } = await supabase
    .from("invoices")
    .select("num")
    .eq("serie", serie)
    .eq("anio", year)
    .order("num", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Total de facturas emitidas en la app: si ya hay alguna, la numeración de
  // arranque se bloquea (la cadena ya está iniciada; cambiarla crearía huecos).
  const { count: emittedCount } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true });
  const locked = (emittedCount ?? 0) > 0;

  // "Suelo" de migración: solo aplica si se fijó para esta serie y año.
  const floorApplies =
    profile?.num_inicial != null &&
    profile?.num_inicial_anio === year &&
    (profile?.num_inicial_serie ?? "").toUpperCase() === serie;
  const numInicial = floorApplies ? Number(profile!.num_inicial) : 0;

  const maxNum = last?.num ?? 0;
  const nextNum = Math.max(maxNum, numInicial) + 1;
  const yy = String(year % 100).padStart(2, "0");
  const nextNumero = `${serie}/${yy}-${String(nextNum).padStart(2, "0")}`;

  const values: ProfileValues = {
    nombre: profile?.nombre ?? "",
    nif: profile?.nif ?? "",
    direccion: profile?.direccion ?? "",
    cp_localidad: profile?.cp_localidad ?? "",
    iban: profile?.iban ?? "",
    iva_def: profile?.iva_def != null ? Number(profile.iva_def) : 21,
    irpf_def: profile?.irpf_def != null ? Number(profile.irpf_def) : 1,
    serie,
    num_inicial: numInicial,
    logo_url: profile?.logo_url ?? "",
    factura_plantilla:
      (profile?.factura_plantilla as "trackapp" | "elegante" | "moderna") ?? "trackapp",
  };

  return (
    <>
      <PageHeader title="Mis datos" kicker="Perfil · emisor" />
      <p className="mb-4 px-1 text-[12.5px] text-dim">
        Estos datos rellenan automáticamente el emisor de tus facturas. Todo es editable antes de
        emitir.
      </p>
      <ProfileForm userId={user.id} values={values} nextNumero={nextNumero} locked={locked} />

      <Link
        href="/camiones"
        className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5 transition-transform active:scale-[0.99]"
      >
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-panel2 text-amber">
          <Icon name="truck" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Camiones</span>
          <span className="block text-[12px] text-dim">Tu flota: asigna cada viaje a su camión</span>
        </span>
        <span className="text-amber">›</span>
      </Link>

      <Link
        href="/ajustes/eventos"
        className="mt-2.5 flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5 transition-transform active:scale-[0.99]"
      >
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-panel2 text-amber">
          <Icon name="doc" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Registro de eventos</span>
          <span className="block text-[12px] text-dim">Historial inalterable de operaciones (Verifactu)</span>
        </span>
        <span className="text-amber">›</span>
      </Link>

      <Link
        href="/ajustes/declaracion"
        className="mt-2.5 flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5 transition-transform active:scale-[0.99]"
      >
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-panel2 text-amber">
          <Icon name="doc" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Declaración responsable</span>
          <span className="block text-[12px] text-dim">Conformidad del productor (Art. 13)</span>
        </span>
        <span className="text-amber">›</span>
      </Link>

      <Link
        href="/ajustes/exportar"
        className="mt-2.5 flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5 transition-transform active:scale-[0.99]"
      >
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-panel2 text-amber">
          <Icon name="save" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Exportar registros</span>
          <span className="block text-[12px] text-dim">Copia de seguridad y CSV para tu asesoría</span>
        </span>
        <span className="text-amber">›</span>
      </Link>

      <form action="/auth/signout" method="post" className="mt-6">
        <button
          type="submit"
          className="w-full rounded-[18px] border border-line bg-panel py-4 text-sm font-bold text-dim transition-transform active:scale-[0.98]"
        >
          Cerrar sesión
        </button>
      </form>
    </>
  );
}
