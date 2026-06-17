import { PageHeader } from "@/components/ui/PageHeader";
import { Row } from "@/components/ui/Row";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { LoadError } from "@/components/ui/LoadError";
import { createClient } from "@/lib/supabase/server";
import { eurPerKm, profitability } from "@/lib/trip";
import { eur, dateES, amount } from "@/lib/format";

export const metadata = { title: "Viajes · TrackApp" };

type ViajeRow = { id: string; fecha: string; origen: string | null; destino: string | null; km: number | null };
type PorteAgg = { total: number; n: number; pendientes: number };

export default async function ViajesPage() {
  const supabase = await createClient();
  const [{ data: vData, error: vErr }, { data: pData, error: pErr }] = await Promise.all([
    supabase.from("viajes").select("id, fecha, origen, destino, km").order("fecha", { ascending: false }),
    supabase.from("trips").select("viaje_id, importe, estado"),
  ]);
  const error = vErr || pErr;
  const viajes = (vData ?? []) as ViajeRow[];

  // Agrega los portes por viaje: total facturable, nº y cuántos pendientes.
  const agg = new Map<string, PorteAgg>();
  for (const p of (pData ?? []) as { viaje_id: string | null; importe: number; estado: string }[]) {
    if (!p.viaje_id) continue;
    const a = agg.get(p.viaje_id) ?? { total: 0, n: 0, pendientes: 0 };
    a.total += Number(p.importe);
    a.n += 1;
    if (p.estado !== "facturado") a.pendientes += 1;
    agg.set(p.viaje_id, a);
  }

  // Un viaje está "facturado" solo si tiene portes y todos están facturados.
  // Un viaje sin portes (se quitaron todos) cuenta como pendiente (hay que añadirlos).
  const estaFacturado = (v: ViajeRow) => {
    const a = agg.get(v.id);
    return !!a && a.n > 0 && a.pendientes === 0;
  };
  const cerrados = viajes.filter(estaFacturado);
  const conPendientes = viajes.filter((v) => !estaFacturado(v));

  return (
    <>
      <PageHeader title="Viajes" kicker="Rentabilidad" hideBack actionHref="/viajes/nuevo" actionLabel="Nuevo viaje" />

      {error ? (
        <LoadError />
      ) : viajes.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-[15px] font-semibold">Aún no has registrado viajes</p>
          <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-dim">
            Registra un viaje y sus portes para calcular rentabilidad y generar facturas.
          </p>
        </div>
      ) : (
        <div className="stagger">
          {conPendientes.length > 0 && (
            <>
              <SectionLabel>Con portes pendientes</SectionLabel>
              {conPendientes.map((v) => (
                <ViajeRowItem key={v.id} v={v} agg={agg.get(v.id)} />
              ))}
            </>
          )}
          {cerrados.length > 0 && (
            <>
              <SectionLabel>Facturados</SectionLabel>
              {cerrados.map((v) => (
                <ViajeRowItem key={v.id} v={v} agg={agg.get(v.id)} />
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}

function ViajeRowItem({ v, agg }: { v: ViajeRow; agg?: PorteAgg }) {
  const total = agg?.total ?? 0;
  const n = agg?.n ?? 0;
  const ek = eurPerKm(total, v.km);
  const prof = profitability(ek);
  const ruta = v.origen && v.destino ? `${v.origen} → ${v.destino}` : v.origen || v.destino || "Viaje";
  const sub = [
    dateES(v.fecha),
    v.km != null ? `${amount(v.km).replace(",00", "")} km` : null,
    `${n} ${n === 1 ? "porte" : "portes"}`,
    ek != null ? `${ek.toFixed(2).replace(".", ",")} €/km` : null,
    prof?.label,
  ]
    .filter(Boolean)
    .join(" · ");
  const facturado = (agg?.pendientes ?? 0) === 0 && n > 0;
  return (
    <Row
      href={`/viajes/${v.id}`}
      icon={<Icon name="truck" />}
      title={ruta}
      subtitle={sub}
      right={
        <div className="flex flex-col items-end gap-1">
          <div className="font-display text-xl font-bold tnum">{eur(total)}</div>
          <Badge tone={facturado ? "good" : "mid"}>{facturado ? "Facturado" : "Pendiente"}</Badge>
          {n > 1 && <Badge tone="mid">Multiporte</Badge>}
        </div>
      }
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mx-1 mb-2 mt-[18px] text-xs font-bold uppercase tracking-[0.16em] text-dim">{children}</div>;
}
