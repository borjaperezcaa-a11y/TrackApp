import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { createClient } from "@/lib/supabase/server";
import { eur, dateES, amount } from "@/lib/format";
import type { Trip } from "@/lib/types";
import { TripForm } from "../TripForm";
import { updateTripAction, deleteTripAction } from "../actions";

export const metadata = { title: "Editar viaje · TrackApp" };

export default async function EditarViajePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const t = data as Trip;

  // Viaje facturado: inmutable. Mostramos solo lectura.
  if (t.estado === "facturado") {
    return (
      <>
        <PageHeader title="Viaje facturado" kicker="Viajes" fallbackHref="/viajes" />
        <Card className="mb-3.5">
          <div className="font-display text-xl font-bold">
            {t.origen && t.destino ? `${t.origen} → ${t.destino}` : t.origen || t.destino || "Viaje"}
          </div>
          <div className="mt-1 text-[13px] text-dim">
            {dateES(t.fecha)}
            {t.km != null ? ` · ${amount(t.km).replace(",00", "")} km` : ""}
            {t.peso != null ? ` · ${amount(t.peso).replace(",00", "")} ${t.peso_unidad}` : ""}
          </div>
          {t.descripcion && <div className="mt-1 text-[13px] font-medium">{t.descripcion}</div>}
          <div className="mt-3 font-display text-2xl font-bold text-amber tnum">{eur(t.importe)}</div>
        </Card>
        <p className="rounded-2xl border border-amber-line bg-amber-soft px-4 py-3 text-[12.5px] font-semibold text-amber">
          Este viaje ya está incluido en una factura emitida, por eso no se puede editar ni borrar.
        </p>
        {t.invoice_id && (
          <Link
            href={`/facturas/${t.invoice_id}`}
            className="mt-3 inline-flex text-sm font-bold text-amber"
          >
            Ver factura ›
          </Link>
        )}
      </>
    );
  }

  const { data: clientsData } = await supabase.from("clients").select("id, nombre").order("nombre");

  return (
    <>
      <PageHeader title="Editar viaje" kicker="Viajes" fallbackHref="/viajes" />
      <TripForm
        action={updateTripAction.bind(null, id)}
        clients={clientsData ?? []}
        values={{
          fecha: t.fecha,
          client_id: t.client_id ?? "",
          origen: t.origen ?? "",
          destino: t.destino ?? "",
          descripcion: t.descripcion ?? "",
          peso: t.peso != null ? String(t.peso) : "",
          peso_unidad: t.peso_unidad ?? "t",
          km: t.km != null ? String(t.km) : "",
          importe: String(t.importe),
        }}
        submitLabel="GUARDAR CAMBIOS"
      />
      <ConfirmDelete
        action={deleteTripAction.bind(null, id)}
        label="Borrar viaje"
        question="¿Seguro que quieres borrar este viaje?"
      />
    </>
  );
}
