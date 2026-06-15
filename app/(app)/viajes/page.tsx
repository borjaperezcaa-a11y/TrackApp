import { PageHeader } from "@/components/ui/PageHeader";
import { Row } from "@/components/ui/Row";
import { Badge } from "@/components/ui/Badge";
import { Fab } from "@/components/ui/Fab";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/server";
import { eurPerKm, profitability } from "@/lib/trip";
import { eur, dateES, amount } from "@/lib/format";

export const metadata = { title: "Viajes · TrackApp" };

type TripRow = {
  id: string;
  fecha: string;
  origen: string | null;
  destino: string | null;
  descripcion: string | null;
  km: number | null;
  importe: number;
  estado: "pendiente" | "facturado";
};

export default async function ViajesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trips")
    .select("id, fecha, origen, destino, descripcion, km, importe, estado")
    // pendientes primero; dentro de cada grupo, los más recientes arriba.
    .order("estado", { ascending: false }) // 'pendiente' > 'facturado' alfabéticamente
    .order("fecha", { ascending: false });
  const trips = (data ?? []) as TripRow[];
  const pendientes = trips.filter((t) => t.estado === "pendiente");
  const facturados = trips.filter((t) => t.estado === "facturado");

  return (
    <>
      <PageHeader title="Viajes" kicker="Rentabilidad" />

      {trips.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-[15px] font-semibold">Aún no has registrado viajes</p>
          <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-dim">
            Registra tus portes para calcular rentabilidad y generar facturas.
          </p>
        </div>
      ) : (
        <div className="stagger">
          {pendientes.length > 0 && (
            <>
              <SectionLabel>Pendientes</SectionLabel>
              {pendientes.map((t) => (
                <TripRowItem key={t.id} t={t} />
              ))}
            </>
          )}
          {facturados.length > 0 && (
            <>
              <SectionLabel>Facturados</SectionLabel>
              {facturados.map((t) => (
                <TripRowItem key={t.id} t={t} />
              ))}
            </>
          )}
        </div>
      )}

      <Fab href="/viajes/nuevo" label="Nuevo viaje" />
    </>
  );
}

function TripRowItem({ t }: { t: TripRow }) {
  const ek = eurPerKm(t.importe, t.km);
  const prof = profitability(ek);
  const ruta =
    t.origen && t.destino ? `${t.origen} → ${t.destino}` : t.origen || t.destino || "Viaje";
  const sub = [
    dateES(t.fecha),
    t.descripcion || null,
    t.km != null ? `${amount(t.km).replace(",00", "")} km` : null,
    ek != null ? `${ek.toFixed(2).replace(".", ",")} €/km` : null,
    prof?.label,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Row
      href={`/viajes/${t.id}`}
      icon={<Icon name="truck" />}
      title={ruta}
      subtitle={sub}
      right={
        <div className="flex flex-col items-end gap-1">
          <div className="font-display text-xl font-bold tnum">{eur(t.importe)}</div>
          <Badge tone={t.estado === "facturado" ? "good" : "mid"}>
            {t.estado === "facturado" ? "Facturado" : "Pendiente"}
          </Badge>
        </div>
      }
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mx-1 mb-2 mt-[18px] text-xs font-bold uppercase tracking-[0.16em] text-dim">{children}</div>;
}
