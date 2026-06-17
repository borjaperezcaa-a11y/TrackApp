import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Gauge } from "@/components/charts/Gauge";
import { MiniBars } from "@/components/charts/MiniBars";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LoadError } from "@/components/ui/LoadError";
import { eur, nowMadrid, num } from "@/lib/format";
import { monthlySeries, bestMonthBeneficio, type SInvoice, type SExpense } from "@/lib/stats";
import { dateParts } from "@/lib/fiscal";

function greeting(h: number): string {
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  // Previsualizar el onboarding aunque la cuenta ya tenga datos: ?onboarding=1
  const forceOnboarding = (await searchParams).onboarding === "1";
  const supabase = await createClient();
  // Hora/fecha en zona España: en el servidor `new Date()` es UTC y, de noche,
  // daría el saludo y el mes equivocados para el usuario.
  const { year, month0, hour } = nowMadrid();

  const [
    { data: profile },
    { data: invData, error: invErr },
    { data: extData, error: extErr },
    { data: incData, error: incErr },
    { data: tripData, error: tripErr },
    { data: expData, error: expErr },
    { count: clientCount },
  ] =
    await Promise.all([
      supabase.from("profiles").select("nombre, nif").maybeSingle(),
      supabase.from("invoices").select("fecha, base, total, pagada, cliente_snapshot"),
      supabase.from("external_invoices").select("fecha, base, total, cobrada"),
      supabase.from("incomes").select("fecha, base, total, concepto, cobrada"),
      supabase.from("trips").select("fecha, km, importe, estado, origen, destino"),
      supabase.from("expenses").select("fecha, categoria, total"),
      supabase.from("clients").select("id", { count: "exact", head: true }),
    ]);

  // Si falló alguna carga, lo avisamos (las cifras podrían estar incompletas).
  const loadError = Boolean(invErr || extErr || incErr || tripErr || expErr);

  // Contabilidad total: ingresos de facturas (propias + externas) + ingresos
  // manuales apuntados por el usuario.
  const invoices: SInvoice[] = [
    ...(invData ?? []).map((i) => ({
      fecha: i.fecha,
      base: num(i.base),
      total: num(i.total),
      clientName: (i.cliente_snapshot as { nombre?: string })?.nombre ?? "Cliente",
    })),
    ...(extData ?? []).map((e) => ({
      fecha: e.fecha,
      base: num(e.base),
      total: num(e.total),
      clientName: "Factura externa",
    })),
    ...(incData ?? []).map((i) => ({
      fecha: i.fecha,
      base: i.base != null ? num(i.base) : num(i.total),
      total: num(i.total),
      clientName: i.concepto ?? "Ingreso",
      esFactura: false, // ingreso manual: no cuenta en el nº de facturas
    })),
  ];
  const expenses: SExpense[] = (expData ?? []).map((e) => ({
    fecha: e.fecha,
    categoria: e.categoria ?? "Otro",
    total: num(e.total),
  }));
  const trips = tripData ?? [];

  const series = monthlySeries(invoices, expenses, year);
  // Guarda: month0 viene de nowMadrid(); si por un runtime sin datos ICU fuera
  // NaN, series[NaN] sería undefined y rompería el render del panel.
  const monthPoint = series[month0] ?? series[0];
  const best = bestMonthBeneficio(invoices, expenses, year);
  const miniData = series.slice(Math.max(0, month0 - 5), month0 + 1);

  const tripsThisMonth = trips.filter((t) => {
    const p = dateParts(t.fecha);
    return p.year === year && p.month0 === month0;
  }).length;

  // Pendiente de cobro: facturas (propias + externas) + ingresos sin cobrar.
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const pendInv = (invData ?? []).filter((i) => !i.pagada);
  const pendExt = (extData ?? []).filter((e) => !e.cobrada);
  const pendInc = (incData ?? []).filter((i) => !i.cobrada);
  const pendingInvoices = pendInv.length;
  const pendienteCobro =
    sum(pendInv.map((i) => num(i.total))) +
    sum(pendExt.map((e) => num(e.total))) +
    sum(pendInc.map((i) => num(i.total)));
  const pendienteCount = pendInv.length + pendExt.length + pendInc.length;

  // Onboarding de primer uso: se muestra mientras no se complete un ciclo.
  const profileComplete = Boolean(profile?.nombre && profile?.nif);
  const hasClients = (clientCount ?? 0) > 0;
  const hasTrips = (tripData ?? []).length > 0;
  const hasInvoices = (invData ?? []).length > 0;
  const onboardingSteps = [
    { label: "Completa tus datos fiscales", href: "/ajustes/perfil", done: profileComplete },
    { label: "Crea tu primer cliente", href: "/clientes/nuevo", done: hasClients },
    { label: "Registra tu primer viaje", href: "/viajes/nuevo", done: hasTrips },
    { label: "Emite tu primera factura", href: "/facturas/nueva", done: hasInvoices },
  ];
  const onboardingDone = onboardingSteps.every((s) => s.done) && !forceOnboarding;

  const dateLabel = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const tiles: { key: string; icon: IconName; label: string; note: string; color: string; href: string }[] = [
    { key: "clientes", icon: "user", label: "Clientes", note: `${clientCount ?? 0} en cartera`, color: "var(--purple)", href: "/clientes" },
    { key: "viajes", icon: "truck", label: "Viajes", note: `${tripsThisMonth} este mes`, color: "var(--blue)", href: "/viajes" },
    { key: "camiones", icon: "rig", label: "Camiones", note: "Tu flota", color: "var(--purple)", href: "/camiones" },
    { key: "facturas", icon: "doc", label: "Facturación", note: `${pendingInvoices} pendientes`, color: "var(--amber)", href: "/facturas" },
    { key: "ingresos", icon: "income", label: "Ingresos", note: "Apunta a mano", color: "var(--green)", href: "/ingresos" },
    { key: "gastos", icon: "euro", label: "Gastos", note: monthPoint.gastos > 0 ? `${eur(monthPoint.gastos)} mes` : "Escanea un ticket", color: "var(--red)", href: "/gastos" },
    { key: "stats", icon: "chart", label: "Estadísticas", note: `${eur(monthPoint.beneficio)} mes`, color: "var(--amber)", href: "/estadisticas" },
    { key: "ajustes", icon: "user", label: "Mi Perfil", note: "Datos de emisor", color: "var(--dim)", href: "/ajustes/perfil" },
  ];

  return (
    <div className="stagger pt-2">
      <header className="flex items-center gap-3 px-0.5 pb-4 pt-2">
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-dim">{greeting(hour)}</div>
          <h1 className="font-display text-2xl font-bold leading-none">{profile?.nombre || "Tu negocio"}</h1>
          <div className="mt-1 text-xs font-medium capitalize text-dim">{dateLabel}</div>
        </div>
        <ThemeToggle />
      </header>

      {loadError && (
        <LoadError message="No se pudieron cargar algunos datos; las cifras pueden estar incompletas." />
      )}

      {/* Acceso rápido a lo más frecuente */}
      <div className="mb-3.5 grid grid-cols-3 gap-2.5">
        <QuickAction href="/gastos/nuevo" icon="image" label="Escanear gasto" color="var(--red)" />
        <QuickAction href="/viajes/nuevo" icon="truck" label="Nuevo viaje" color="var(--blue)" />
        <QuickAction href="/ingresos/nuevo" icon="income" label="Nuevo ingreso" color="var(--green)" />
      </div>

      {/* Onboarding de primer uso */}
      {!onboardingDone && (
        <section className="mb-3.5 rounded-[20px] border border-amber-line bg-amber-soft p-4">
          <div className="text-[13px] font-extrabold text-amber">Primeros pasos</div>
          <div className="mt-2.5 space-y-1">
            {onboardingSteps.map((s, idx) => {
              const isNext = !s.done && onboardingSteps.slice(0, idx).every((p) => p.done);
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 transition-transform active:scale-[0.99]"
                >
                  <span
                    className={`grid h-5 w-5 flex-none place-items-center rounded-full border ${s.done ? "border-green bg-green text-[#0c0e12]" : "border-amber text-amber"}`}
                  >
                    {s.done ? <Icon name="check" size={13} /> : <span className="text-[11px] font-bold">{idx + 1}</span>}
                  </span>
                  <span className={`flex-1 text-[13px] font-semibold ${s.done ? "text-dim line-through" : "text-text"}`}>
                    {s.label}
                  </span>
                  {isNext && <span className="text-[13px] font-bold text-amber">Empezar ›</span>}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Pendiente de cobro */}
      {pendienteCobro > 0 && (
        <Link
          href="/facturas"
          className="mb-3.5 flex items-center justify-between rounded-[20px] border border-line bg-panel px-[18px] py-4 shadow-[var(--shadow)] transition-transform active:scale-[0.985]"
        >
          <div>
            <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-dim">Pendiente de cobro</div>
            <div className="mt-1 font-display text-[26px] font-bold leading-none text-amber tnum">{eur(pendienteCobro)}</div>
            <div className="mt-1 text-[12px] text-dim">
              {pendienteCount} {pendienteCount === 1 ? "documento sin cobrar" : "documentos sin cobrar"}
            </div>
          </div>
          <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-amber-soft text-amber">
            <Icon name="euro" size={24} />
          </span>
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

function QuickAction({ href, icon, label, color }: { href: string; icon: IconName; label: string; color: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-[16px] border border-line bg-panel px-2 py-3 text-center transition-transform active:scale-95"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
        <Icon name={icon} size={20} />
      </span>
      <span className="text-[11px] font-bold leading-tight">{label}</span>
    </Link>
  );
}
