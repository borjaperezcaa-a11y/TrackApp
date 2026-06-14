import Image from "next/image";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { createClient } from "@/lib/supabase/server";
import { dateES } from "@/lib/format";
import { ExpenseForm } from "../ExpenseForm";
import { updateExpenseAction, deleteExpenseAction } from "../actions";

export const metadata = { title: "Editar gasto · TrackApp" };

type ExpenseFull = {
  id: string;
  categoria: string | null;
  estacion: string | null;
  fecha: string | null;
  base: number | null;
  iva: number | null;
  total: number;
  trip_id: string | null;
  foto_url: string | null;
};

export default async function EditarGastoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("expenses").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const e = data as ExpenseFull;

  const { data: tripsData } = await supabase
    .from("trips")
    .select("id, fecha, origen, destino")
    .order("fecha", { ascending: false })
    .limit(50);
  const trips = (tripsData ?? []).map((t) => ({
    id: t.id,
    label: `${dateES(t.fecha)} · ${t.origen ?? ""} → ${t.destino ?? ""}`.trim(),
  }));

  // URL firmada para mostrar el ticket (bucket privado).
  let ticketUrl: string | null = null;
  if (e.foto_url) {
    const { data: signed } = await supabase.storage.from("recibos").createSignedUrl(e.foto_url, 120);
    ticketUrl = signed?.signedUrl ?? null;
  }

  return (
    <>
      <PageHeader title="Editar gasto" kicker="Gastos" fallbackHref="/gastos" />
      {ticketUrl && (
        <div className="mb-3.5 overflow-hidden rounded-2xl border border-line">
          <Image src={ticketUrl} alt="Ticket" width={600} height={400} unoptimized className="h-auto w-full object-contain" />
        </div>
      )}
      <ExpenseForm
        userId={user.id}
        trips={trips}
        action={updateExpenseAction.bind(null, id)}
        submitLabel="GUARDAR CAMBIOS"
        values={{
          categoria: e.categoria ?? "Gasoil",
          estacion: e.estacion ?? "",
          fecha: e.fecha ?? "",
          base: e.base != null ? String(e.base) : "",
          iva: e.iva != null ? String(e.iva) : "",
          total: String(e.total),
          trip_id: e.trip_id ?? "",
          foto_path: e.foto_url,
        }}
      />
      <ConfirmDelete
        action={deleteExpenseAction.bind(null, id)}
        label="Borrar gasto"
        question="¿Seguro que quieres borrar este gasto?"
      />
    </>
  );
}
