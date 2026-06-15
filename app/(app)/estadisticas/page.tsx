import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { dateParts } from "@/lib/fiscal";
import type { SInvoice, STrip, SExpense } from "@/lib/stats";
import { PeriodStats } from "./PeriodStats";

export const metadata = { title: "Estadísticas · TrackApp" };

export default async function EstadisticasPage() {
  const supabase = await createClient();

  const [{ data: invData }, { data: extData }, { data: incData }, { data: tripData }, { data: expData }] = await Promise.all([
    supabase.from("invoices").select("fecha, base, total, cliente_snapshot"),
    supabase.from("external_invoices").select("fecha, base, total, cliente"),
    supabase.from("incomes").select("fecha, base, total, concepto"),
    supabase.from("trips").select("fecha, km, importe, origen, destino, peso, peso_unidad"),
    supabase.from("expenses").select("fecha, categoria, total"),
  ]);

  // Contabilidad total: ingresos de facturas (propias + externas) + ingresos
  // manuales apuntados por el usuario.
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
      clientName: e.cliente ?? "Factura externa",
    })),
    ...(incData ?? []).map((i) => ({
      fecha: i.fecha,
      base: i.base != null ? Number(i.base) : Number(i.total),
      total: Number(i.total),
      clientName: i.concepto ?? "Ingreso",
    })),
  ];
  const trips: STrip[] = (tripData ?? []).map((t) => {
    const peso = t.peso != null ? Number(t.peso) : null;
    const toneladas = peso == null ? null : t.peso_unidad === "kg" ? peso / 1000 : peso;
    return {
      fecha: t.fecha,
      km: t.km != null ? Number(t.km) : null,
      importe: Number(t.importe),
      ruta: t.origen && t.destino ? `${t.origen} → ${t.destino}` : t.origen || t.destino || "",
      toneladas,
    };
  });
  const expenses: SExpense[] = (expData ?? []).map((e) => ({
    fecha: e.fecha,
    categoria: e.categoria ?? "Otro",
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
