import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Row } from "@/components/ui/Row";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/server";
import { eur, dateES } from "@/lib/format";

export const metadata = { title: "Facturas externas · TrackApp" };

type ExtRow = {
  id: string;
  numero: string;
  fecha: string;
  total: number;
  cobrada: boolean;
  cliente: string | null;
};

export default async function FacturasExternasPage() {
  const supabase = await createClient();
  // Ordenadas por serie: el número libre incluye la serie (p. ej. COOP/25-1234),
  // así que ordenar por `numero` agrupa cada serie y la deja correlativa.
  const { data } = await supabase
    .from("external_invoices")
    .select("id, numero, fecha, total, cobrada, cliente")
    .order("numero", { ascending: true });
  const rows = (data ?? []) as ExtRow[];

  return (
    <>
      <PageHeader title="Externas" kicker="Facturas registradas" fallbackHref="/facturas" actionHref="/facturas/externas/nueva" actionLabel="Registrar factura" />

      <Tabs />

      {rows.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-[15px] font-semibold">Aún no has registrado facturas externas</p>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] text-dim">
            Son las que otro (p. ej. tu cooperativa) emite en tu nombre. Hazles una foto y la IA rellena los datos, o adjunta el PDF.
          </p>
          <Link href="/facturas/externas/nueva" className="mt-4 inline-flex rounded-2xl bg-amber px-5 py-2.5 text-[13px] font-extrabold text-[#1a1205]">
            Registrar una factura
          </Link>
        </div>
      ) : (
        <div className="stagger">
          {rows.map((r) => (
            <ExternalRow key={r.id} r={r} />
          ))}
        </div>
      )}
    </>
  );
}

function ExternalRow({ r }: { r: ExtRow }) {
  return (
    <Row
      href={`/facturas/externas/${r.id}`}
      icon={<Icon name="doc" />}
      title={r.cliente ?? "Cliente"}
      subtitle={`${r.numero} · ${dateES(r.fecha)}`}
      right={
        <div className="flex flex-col items-end gap-1">
          <div className="font-display text-xl font-bold tnum">{eur(Number(r.total))}</div>
          <Badge tone={r.cobrada ? "good" : "mid"}>{r.cobrada ? "Cobrada" : "Pendiente"}</Badge>
        </div>
      }
    />
  );
}

function Tabs() {
  return (
    <div className="mb-3.5 flex gap-2">
      <Link href="/facturas" className="rounded-[13px] border-[1.5px] border-line bg-panel px-4 py-2.5 text-sm font-bold text-text">
        Emitidas
      </Link>
      <span className="rounded-[13px] border-[1.5px] border-amber bg-amber-soft px-4 py-2.5 text-sm font-bold text-amber">
        Externas
      </span>
    </div>
  );
}
