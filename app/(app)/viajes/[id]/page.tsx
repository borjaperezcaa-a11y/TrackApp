import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { createClient } from "@/lib/supabase/server";
import { eur, dateES, intES } from "@/lib/format";
import type { Viaje } from "@/lib/types";
import { PorteForm, type Stop } from "../PorteForm";
import { PorteItem } from "../PorteItem";
import { TrayectoForm } from "../TrayectoForm";
import { addPorteAction, updateViajeAction, updatePorteAction, deletePorteAction, deleteViajeAction } from "../actions";

export const metadata = { title: "Viaje · TrackApp" };

type PorteRow = {
  id: string;
  client_id: string | null;
  origen: string | null;
  destino: string | null;
  descripcion: string | null;
  peso: number | null;
  peso_unidad: string | null;
  importe: number;
  estado: "pendiente" | "facturado";
  invoice_id: string | null;
};

// Reconstruye las paradas {cp, lugar} a partir del texto guardado ("CP Localidad",
// una por línea en grupaje). Permite reeditar cargas/descargas con su CP.
function parseStops(s: string | null): Stop[] {
  const lines = (s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  if (lines.length === 0) return [{ lugar: "", cp: "" }];
  return lines.map((line) => {
    const m = /^(\d{4,5})\s+(.+)$/.exec(line);
    return m ? { cp: m[1], lugar: m[2] } : { cp: "", lugar: line };
  });
}

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

  const [{ data: portesData }, { data: clientsData }, { data: vehiculosData }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, client_id, origen, destino, descripcion, peso, peso_unidad, importe, estado, invoice_id")
      .eq("viaje_id", id)
      .eq("user_id", user.id)
      .order("created_at"),
    supabase.from("clients").select("id, nombre").order("nombre"),
    supabase.from("vehiculos").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  const portes = (portesData ?? []) as PorteRow[];
  const clients = (clientsData ?? []) as { id: string; nombre: string }[];
  const vehiculos = (vehiculosData ?? []) as { id: string; nombre: string }[];
  const nombreCliente = new Map(clients.map((c) => [c.id, c.nombre]));
  const nombreCamion = vehiculos.find((x) => x.id === v.vehiculo_id)?.nombre ?? null;

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
          {v.km != null ? `${intES(Math.round(v.km))} km` : "Sin km"} · {portes.length}{" "}
          {portes.length === 1 ? "porte" : "portes"}
          {nombreCamion ? ` · 🚛 ${nombreCamion}` : ""}
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
          const o = (p.origen ?? "").replace(/\n/g, " · ");
          const d = (p.destino ?? "").replace(/\n/g, " · ");
          const rutaP = o && d ? `${o} → ${d}` : o || d || "—";
          return (
            <PorteItem
              key={p.id}
              clientName={p.client_id ? nombreCliente.get(p.client_id) ?? "Cliente" : "Cliente"}
              ruta={rutaP}
              descripcion={p.descripcion}
              importe={Number(p.importe)}
              facturado={p.estado === "facturado"}
              invoiceId={p.invoice_id}
              clients={clients}
              initial={{
                client_id: p.client_id ?? "",
                origenes: parseStops(p.origen),
                destinos: parseStops(p.destino),
                descripcion: p.descripcion ?? "",
                peso: p.peso != null ? String(p.peso) : "",
                peso_unidad: p.peso_unidad === "t" ? "t" : "kg",
                importe: String(p.importe),
              }}
              updateAction={updatePorteAction.bind(null, p.id)}
              deleteAction={deletePorteAction.bind(null, p.id)}
            />
          );
        })
      )}

      {/* Añadir porte */}
      <div className="mb-2 mt-6 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Añadir porte</div>
      <PorteForm action={addPorteAction.bind(null, id)} clients={clients} />

      {/* Editar trayecto */}
      <div className="mb-2 mt-8 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Editar trayecto</div>
      <TrayectoForm
        action={updateViajeAction.bind(null, id)}
        vehiculos={vehiculos}
        defaults={{
          fecha: v.fecha,
          origen: v.origen ?? "",
          destino: v.destino ?? "",
          km: v.km != null ? String(v.km) : "",
          vehiculo_id: v.vehiculo_id ?? "",
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
