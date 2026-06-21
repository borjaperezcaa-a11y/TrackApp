import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Ajustes · TrackApp" };

function Row({
  href,
  icon,
  title,
  subtitle,
  warn = false,
}: {
  href: string;
  icon: IconName;
  title: string;
  subtitle: string;
  warn?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5 transition-transform active:scale-[0.99]"
      >
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-panel2 text-amber">
          <Icon name={icon} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{title}</span>
          <span className={`block truncate text-[12px] ${warn ? "font-semibold text-amber" : "text-dim"}`}>
            {subtitle}
          </span>
        </span>
        <span aria-hidden="true" className="text-amber">
          ›
        </span>
      </Link>
    </li>
  );
}

export default async function AjustesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // el layout ya redirige; esto narra el tipo

  const { data: p } = await supabase
    .from("profiles")
    .select("nombre, nif, iva_def, irpf_def, serie")
    .eq("user_id", user.id)
    .maybeSingle();

  const datosOk = Boolean(p?.nombre && p?.nif);
  const iva = p?.iva_def != null ? Number(p.iva_def) : 21;
  const irpf = p?.irpf_def != null ? Number(p.irpf_def) : 1;
  const serie = (p?.serie ?? "FACT").toUpperCase();

  return (
    <>
      <PageHeader title="Ajustes" kicker="Configuración" hideBack />

      <nav aria-label="Secciones de ajustes" className="stagger">
        <h2 className="mb-2 mt-1 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Facturación</h2>
        <ul className="space-y-2.5">
          <Row
            href="/ajustes/datos"
            icon="user"
            title="Mi perfil"
            subtitle={datosOk ? "Tus datos y logo" : "Faltan tus datos fiscales"}
            warn={!datosOk}
          />
          <Row
            href="/ajustes/factura"
            icon="doc"
            title="Factura"
            subtitle={`Numeración (serie ${serie}) y cláusula de condiciones`}
          />
          <Row
            href="/ajustes/impuestos"
            icon="euro"
            title="Impuestos por defecto"
            subtitle={`IVA ${iva}% · IRPF ${irpf}%`}
          />
        </ul>

        <h2 className="mb-2 mt-5 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Registros y datos</h2>
        <ul className="space-y-2.5">
          <Row
            href="/ajustes/declaracion"
            icon="doc"
            title="Declaración responsable"
            subtitle="Conformidad del productor (Art. 13)"
          />
          <Row
            href="/ajustes/eventos"
            icon="doc"
            title="Historial de eventos"
            subtitle="Registro inalterable de operaciones (Verifactu)"
          />
          <Row
            href="/ajustes/exportar"
            icon="save"
            title="Exportar mis datos"
            subtitle="Copia de seguridad y CSV para tu asesoría"
          />
        </ul>

        <h2 className="mb-2 mt-5 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Aplicación</h2>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-panel2 text-amber">
            <Icon name="moon" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Tema</span>
            <span className="block text-[12px] text-dim">Claro u oscuro</span>
          </span>
          <ThemeToggle />
        </div>
      </nav>

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
