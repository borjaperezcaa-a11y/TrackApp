import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { createClient } from "@/lib/supabase/server";
import { eur, dateES, amount } from "@/lib/format";
import type { Viaje } from "@/lib/types";
import { PorteForm } from "../PorteForm";
import { TrayectoForm } from "../TrayectoForm";
import { addPorteAction, updateViajeAction, deletePorteAction, deleteViajeAction } from "../actions";

export const metadata = { title: "Viaje · TrackApp" };

type PorteRow = {
  id: string;
  client_id: string | null;
  origen: string | null;
  destino: string | null;
  descripcion: string | null;
  importe: number;
  estado: "pendiente" | "facturado";
  invoice_id: string | null;
};

export default async function ViajeDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: viajeData } = await supabase
    .from("viajes")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viajeData) notFound();
  const v = viajeData as Viaje;

  const [{ data: portesData }, { data: clientsData }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, client_id, origen, destino, descripcion, importe, estado, invoice_id")
      .eq("viaje_id", id)
      .eq("user_id", user.id)
      .order("created_at"),
    supabase.from("clients").select("id, nombre").order("nombre"),
  ]);
  const portes = (portesData ?? []) as PorteRow[];
  const clients = (clientsData ?? []) as { id: string; nombre: string }[];
  const nombreCliente = new Map(clients.map((c) => [c.id, c.nombre]));

  const total = portes.reduce((s, p) => s + Number(p.importe), 0);
  const hayFacturados = portes.some((p) => p.estado === "facturado");
  const ruta = v.origen && v.destino ? `${v.origen} → ${v.destino}` : v.origen || v.destino || "Viaje";

  return (
    <>
      <PageHeader title={ruta} kicker="Viaje" fallbackHref="/viajes" />

      {/* Resumen del trayecto */}
      <Card className="mb-3.5">
        <div className="text-[12.5px] text-dim">{dateES(v.fecha)}</div>
        <div className="mt-0.5 font-display text-xl font-bold">{ruta}</div>
        <div className="mt-1 text-[13px] text-dim">
          {v.km != null ? `${amount(v.km).replace(",00", "")} km` : "Sin km"} · {portes.length}{" "}
          {portes.length === 1 ? "porte" : "portes"}
        </div>
        <div className="mt-3 font-display text-2xl font-bold text-amber tnum">{eur(total)}</div>
      </Card>

      {/* Portes del viaje */}
      <div className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">
        Portes ({portes.length})
      </div>
      {portes.length === 0 ? (
        <Card soft className="mb-3.5">
          <p className="text-[13px] text-dim">Este viaje no tiene portes. Añade uno abajo.</p>
        </Card>
      ) : (
        portes.map((p) => {
          const rutaP = p.origen && p.destino ? `${p.origen} → ${p.destino}` : p.origen || p.destino || "—";
          return (
            <Card key={p.id} soft className="mb-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{p.client_id ? nombreCliente.get(p.client_id) ?? "Cliente" : "Cliente"}</div>
                  <div className="mt-0.5 truncate text-[12.5px] text-dim">{rutaP}</div>
                  {p.descripcion && <div className="mt-0.5 text-[12.5px]">{p.descripcion}</div>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="font-display text-lg font-bold tnum">{eur(Number(p.importe))}</div>
                  <Badge tone={p.estado === "facturado" ? "good" : "mid"}>
                    {p.estado === "facturado" ? "Facturado" : "Pendiente"}
                  </Badge>
                </div>
              </div>
              {p.estado === "facturado" ? (
                p.invoice_id && (
                  <Link href={`/facturas/${p.invoice_id}`} className="mt-2 inline-flex text-[13px] font-bold text-amber">
                    Ver factura ›
                  </Link>
                )
              ) : (
                <ConfirmDelete
                  action={deletePorteAction.bind(null, p.id)}
                  label="Quitar porte"
                  question="¿Quitar este porte del viaje?"
                />
              )}
            </Card>
          );
        })
      )}

      {/* Añadir porte */}
      <div className="mb-2 mt-6 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Añadir porte</div>
      <PorteForm
        action={addPorteAction.bind(null, id)}
        clients={clients}
        rutaPlaceholder={{ origen: v.origen ?? undefined, destino: v.destino ?? undefined }}
      />

      {/* Editar trayecto */}
      <div className="mb-2 mt-8 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Editar trayecto</div>
      <TrayectoForm
        action={updateViajeAction.bind(null, id)}
        defaults={{
          fecha: v.fecha,
          origen: v.origen ?? "",
          destino: v.destino ?? "",
          km: v.km != null ? String(v.km) : "",
        }}
      />

      {/* Borrar viaje (solo si ningún porte está facturado) */}
      {!hayFacturados && (
        <ConfirmDelete
          action={deleteViajeAction.bind(null, id)}
          label="Borrar viaje"
          question="¿Borrar el viaje y todos sus portes?"
        />
      )}
    </>
  );
}
