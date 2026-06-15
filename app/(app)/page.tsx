import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Gauge } from "@/components/charts/Gauge";
import { MiniBars } from "@/components/charts/MiniBars";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { eur } from "@/lib/format";
import { monthlySeries, bestMonthBeneficio, type SInvoice, type SExpense } from "@/lib/stats";
import { dateParts } from "@/lib/fiscal";

function greeting(h: number): string {
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

export default async function HomePage() {
  const supabase = await createClient();
  const now = new Date();
  const year = now.getFullYear();
  const month0 = now.getMonth();

  const [{ data: profile }, { data: invData }, { data: extData }, { data: tripData }, { data: expData }, { count: clientCount }] =
    await Promise.all([
      supabase.from("profiles").select("nombre, nif").maybeSingle(),
      supabase.from("invoices").select("fecha, base, total, pagada, cliente_snapshot"),
      supabase.from("external_invoices").select("fecha, base, total, cobrada"),
      supabase.from("trips").select("fecha, km, importe, estado, origen, destino"),
      supabase.from("expenses").select("fecha, categoria, total"),
      supabase.from("clients").select("id", { count: "exact", head: true }),
    ]);

  // Contabilidad total: ingresos propios (Verifactu) + facturas de cooperativa.
  const invoices: SInvoice[] = [
    ...(invData ?? []).map((i) => ({
      fecha: i.fecha,
      base: Number(i.base),
      total: Number(i.total),
      clientName: (i.cliente_snapshot as { nombre?: string })?.nombre ?? "Cliente",
    })),
    ...(extData ?? []).map((e) => ({
      fecha: e.fecha,
      base: Number(e.base),
      total: Number(e.total),
      clientName: "Cooperativa",
    })),
  ];
  const expenses: SExpense[] = (expData ?? []).map((e) => ({
    fecha: e.fecha,
    categoria: e.categoria ?? "Otro",
    total: Number(e.total),
  }));
  const trips = tripData ?? [];

  const series = monthlySeries(invoices, expenses, year);
  const monthPoint = series[month0];
  const best = bestMonthBeneficio(invoices, expenses, year);
  const miniData = series.slice(Math.max(0, month0 - 5), month0 + 1);

  const tripsThisMonth = trips.filter((t) => {
    const p = dateParts(t.fecha);
    return p.year === year && p.month0 === month0;
  }).length;
  const pendingInvoices = (invData ?? []).filter((i) => !i.pagada).length;

  const dateLabel = now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  const tiles: { key: string; icon: IconName; label: string; note: string; color: string; href: string }[] = [
    { key: "stats", icon: "chart", label: "Estadísticas", note: `${eur(monthPoint.beneficio)} mes`, color: "var(--amber)", href: "/estadisticas" },
    { key: "viajes", icon: "truck", label: "Viajes", note: `${tripsThisMonth} este mes`, color: "var(--blue)", href: "/viajes" },
    { key: "facturas", icon: "doc", label: "Facturas", note: `${pendingInvoices} pendientes`, color: "var(--amber)", href: "/facturas" },
    { key: "gastos", icon: "euro", label: "Gastos", note: monthPoint.gastos > 0 ? `${eur(monthPoint.gastos)} mes` : "Escanea un ticket", color: "var(--red)", href: "/gastos" },
    { key: "clientes", icon: "user", label: "Clientes", note: `${clientCount ?? 0} en cartera`, color: "var(--green)", href: "/clientes" },
    { key: "ajustes", icon: "gear", label: "Mis datos", note: "Perfil emisor", color: "var(--dim)", href: "/ajustes/perfil" },
  ];

  return (
    <div className="stagger pt-2">
      <header className="flex items-center gap-3 px-0.5 pb-4 pt-2">
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-dim">{greeting(now.getHours())}</div>
          <h1 className="font-display text-2xl font-bold leading-none">{profile?.nombre || "Tu negocio"}</h1>
          <div className="mt-1 text-xs font-medium capitalize text-dim">{dateLabel}</div>
        </div>
        <ThemeToggle />
      </header>

      {(!profile?.nombre || !profile?.nif) && (
        <Link
          href="/ajustes/perfil"
          className="mb-3.5 block rounded-2xl border border-amber-line bg-amber-soft px-4 py-3 text-[12.5px] font-semibold text-amber transition-transform active:scale-[0.99]"
        >
          Completa tus datos fiscales (nombre y NIF) para poder emitir facturas ›
        </Link>
      )}

      {/* Medidor de beneficio del mes */}
      <section className="mb-3.5 rounded-[20px] border border-line bg-panel px-[18px] pb-[22px] pt-5 text-center shadow-[var(--shadow)]">
        <div className="text-[11.5px] font-bold uppercase tracking-[0.2em] text-dim">Beneficio neto · este mes</div>
        <div className="mt-2">
          <Gauge value={monthPoint.beneficio} max={best} label="Beneficio neto del mes" />
        </div>
        <div className="mt-3.5 flex justify-center gap-2.5">
          <span className="flex items-center gap-1.5 rounded-[13px] border border-line bg-panel2 px-3.5 py-2.5 text-sm font-semibold">
            <span className="text-green">▲</span>
            <span className="text-[12.5px] font-medium text-dim">Ingresos</span>
            <b className="tnum">{eur(monthPoint.ingresos)}</b>
          </span>
          <span className="flex items-center gap-1.5 rounded-[13px] border border-line bg-panel2 px-3.5 py-2.5 text-sm font-semibold">
            <span className="text-amber">▼</span>
            <span className="text-[12.5px] font-medium text-dim">Gastos</span>
            <b className="tnum">{eur(monthPoint.gastos)}</b>
          </span>
        </div>
      </section>

      {/* Mini-gráfica → estadísticas */}
      <Link href="/estadisticas" className="mb-3.5 block rounded-[20px] border border-line bg-panel p-[18px] shadow-[var(--shadow)] transition-transform active:scale-[0.985]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[14.5px] font-bold">Ingresos vs gastos</span>
          <span className="text-[12.5px] font-bold text-amber">Ver estadísticas ›</span>
        </div>
        <MiniBars data={miniData} />
      </Link>

      {/* Accesos */}
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className="flex min-h-[104px] flex-col gap-2 rounded-[18px] border border-line bg-panel p-3.5 transition-transform active:scale-95"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ color: t.color, background: `color-mix(in srgb, ${t.color} 16%, transparent)` }}>
              <Icon name={t.icon} size={22} />
            </span>
            <span className="text-sm font-bold">{t.label}</span>
            <span className="-mt-0.5 text-[11.5px] font-semibold text-dim">{t.note}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
