import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const SECTIONS: {
  key: string;
  label: string;
  note: string;
  color: string;
  href?: string;
}[] = [
  { key: "stats", label: "Estadísticas", note: "Paso 5", color: "var(--amber)" },
  { key: "viajes", label: "Viajes", note: "Paso 3", color: "var(--blue)" },
  { key: "facturas", label: "Facturas", note: "Paso 4", color: "var(--amber)" },
  { key: "gastos", label: "Gastos", note: "MVP+", color: "var(--red)" },
  { key: "clientes", label: "Clientes", note: "Paso 2", color: "var(--green)" },
  { key: "ajustes", label: "Mis datos", note: "Perfil emisor", color: "var(--dim)", href: "/ajustes/perfil" },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="stagger pt-2">
      <header className="flex items-center gap-3 px-0.5 pb-4 pt-2">
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-dim">
            Sesión iniciada
          </div>
          <h1 className="font-display text-2xl font-bold leading-none">{user?.email}</h1>
          <div className="mt-1 text-xs font-medium text-dim">Panel · paso 0 (scaffold)</div>
        </div>
        <form action="/auth/signout" method="post" className="ml-auto">
          <button
            type="submit"
            className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm font-bold text-dim transition-transform active:scale-90"
          >
            Salir
          </button>
        </form>
      </header>

      <section className="mb-3.5 rounded-[20px] border border-line bg-panel p-5 text-center shadow-[var(--shadow)]">
        <div className="text-[11.5px] font-bold uppercase tracking-[0.2em] text-dim">
          Beneficio neto · este mes
        </div>
        <div className="font-display text-[54px] font-bold leading-none text-green tnum">
          —<span className="ml-0.5 align-top text-2xl">€</span>
        </div>
        <p className="mt-2 text-xs text-dim">El medidor y las estadísticas llegan en el paso 5.</p>
      </section>

      <div className="grid grid-cols-3 gap-3">
        {SECTIONS.map((s) => {
          const inner = (
            <>
              <span
                className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold"
                style={{
                  color: s.color,
                  background: `color-mix(in srgb, ${s.color} 16%, transparent)`,
                }}
              >
                {s.label[0]}
              </span>
              <span className="text-sm font-bold">{s.label}</span>
              <span className="-mt-0.5 text-[11.5px] font-semibold text-dim">{s.note}</span>
            </>
          );
          const cls =
            "flex min-h-[104px] flex-col gap-2 rounded-[18px] border border-line bg-panel p-3.5 transition-transform active:scale-95";
          return s.href ? (
            <Link key={s.key} href={s.href} className={cls}>
              {inner}
            </Link>
          ) : (
            <div key={s.key} className={`${cls} opacity-70`}>
              {inner}
            </div>
          );
        })}
      </div>

      <p className="mt-6 rounded-2xl border border-amber-line bg-amber-soft px-4 py-3 text-[12.5px] font-semibold text-amber">
        Motor Verifactu en construcción. Aún NO es facturación oficial: no se envían registros a la
        AEAT ni se firma con certificado digital.
      </p>
    </div>
  );
}
