import { PageHeader } from "@/components/ui/PageHeader";
import { LoadError } from "@/components/ui/LoadError";
import { createClient } from "@/lib/supabase/server";
import { dateParts } from "@/lib/fiscal";
import type { SInvoice, STrip, SExpense } from "@/lib/stats";
import { PeriodStats } from "./PeriodStats";

export const metadata = { title: "Estadísticas · TrackApp" };

export default async function EstadisticasPage() {
  const supabase = await createClient();

  const [
    { data: invData, error: invErr },
    { data: extData, error: extErr },
    { data: incData, error: incErr },
    { data: tripData, error: tripErr },
    { data: expData, error: expErr },
  ] = await Promise.all([
    supabase.from("invoices").select("fecha, base, iva, irpf, total, tipo, cliente_snapshot"),
    supabase.from("external_invoices").select("fecha, base, iva, irpf, total, cliente"),
    supabase.from("incomes").select("fecha, base, iva, total, concepto, cliente"),
    supabase.from("trips").select("fecha, km, importe, origen, destino"),
    supabase.from("expenses").select("fecha, categoria, iva, total"),
  ]);

  // No disfrazar un fallo de carga de "sin actividad": mostrar error con reintento.
  if (invErr || extErr || incErr || tripErr || expErr) {
    return (
      <>
        <PageHeader title="Estadísticas" kicker="Periodo fiscal" hideBack />
        <LoadError />
      </>
    );
  }

  // Contabilidad total: ingresos de facturas (propias + externas) + ingresos
  // manuales apuntados por el usuario.
  const invoices: SInvoice[] = [
    ...(invData ?? []).map((i) => ({
      fecha: i.fecha,
      base: Number(i.base),
      iva: Number(i.iva ?? 0),
      irpf: Number(i.irpf ?? 0),
      total: Number(i.total),
      clientName: (i.cliente_snapshot as { nombre?: string })?.nombre ?? "Cliente",
      // Las rectificativas (R1) ajustan importes pero NO cuentan como una factura
      // nueva: su importe (con signo) ya compensa el de la original.
      esFactura: i.tipo === "F1",
    })),
    ...(extData ?? []).map((e) => ({
      fecha: e.fecha,
      base: Number(e.base),
      iva: Number(e.iva ?? 0),
      irpf: Number(e.irpf ?? 0),
      total: Number(e.total),
      clientName: e.cliente ?? "Factura externa",
    })),
    ...(incData ?? []).map((i) => ({
      fecha: i.fecha,
      base: i.base != null ? Number(i.base) : Number(i.total),
      iva: Number(i.iva ?? 0),
      irpf: 0,
      total: Number(i.total),
      // Si el ingreso tiene cliente, suma a ese cliente en el ranking; si no,
      // se identifica por su concepto.
      clientName: i.cliente?.trim() || i.concepto || "Ingreso",
      esFactura: false, // ingreso manual: no cuenta en el nº de facturas
    })),
  ];
  const trips: STrip[] = (tripData ?? []).map((t) => ({
    fecha: t.fecha,
    km: t.km != null ? Number(t.km) : null,
    importe: Number(t.importe),
    ruta: t.origen && t.destino ? `${t.origen} → ${t.destino}` : t.origen || t.destino || "",
  }));
  const expenses: SExpense[] = (expData ?? []).map((e) => ({
    fecha: e.fecha,
    categoria: e.categoria ?? "Otro",
    iva: Number(e.iva ?? 0),
    total: Number(e.total),
  }));

  const yearsSet = new Set<number>();
  for (const r of [...invoices, ...trips, ...expenses]) yearsSet.add(dateParts(r.fecha).year);
  const currentYear = new Date().getFullYear();
  yearsSet.add(currentYear);
  const years = [...yearsSet].sort((a, b) => b - a);

  return (
    <>
      <PageHeader title="Estadísticas" kicker="Periodo fiscal" hideBack />
      <PeriodStats
        invoices={invoices}
        trips={trips}
        expenses={expenses}
        years={years}
        defaultYear={years[0] ?? currentYear}
      />
    </>
  );
}
