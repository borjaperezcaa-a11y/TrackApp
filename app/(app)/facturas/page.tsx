import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Row } from "@/components/ui/Row";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/server";
import { eur, dateES } from "@/lib/format";
import type { ClienteSnapshot } from "@/lib/types";

export const metadata = { title: "Facturas · TrackApp" };

type InvoiceRow = {
  id: string;
  numero: string;
  fecha: string;
  total: number;
  pagada: boolean;
  tipo: string;
  cliente_snapshot: ClienteSnapshot;
};

export default async function FacturasPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, numero, fecha, total, pagada, tipo, cliente_snapshot")
    // pagada=false (pendientes) primero; dentro de cada grupo, las más recientes arriba.
    .order("pagada", { ascending: true })
    .order("emitida_at", { ascending: false });
  const invoices = (data ?? []) as InvoiceRow[];
  const pendientes = invoices.filter((i) => !i.pagada);
  const cobradas = invoices.filter((i) => i.pagada);

  return (
    <>
      <PageHeader title="Facturas" kicker="Emitidas" hideBack actionHref="/facturas/nueva" actionLabel="Nueva factura" />

      <Tabs />

      {invoices.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-[15px] font-semibold">Aún no has emitido facturas</p>
          <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-dim">
            Genera tu primera factura a partir de los viajes pendientes de un cliente.
          </p>
        </div>
      ) : (
        <div className="stagger">
          {pendientes.length > 0 && (
            <>
              <SectionLabel>Pendientes</SectionLabel>
              {pendientes.map((inv) => (
                <InvoiceRowItem key={inv.id} inv={inv} />
              ))}
            </>
          )}
          {cobradas.length > 0 && (
            <>
              <SectionLabel>Cobradas</SectionLabel>
              {cobradas.map((inv) => (
                <InvoiceRowItem key={inv.id} inv={inv} />
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}

function InvoiceRowItem({ inv }: { inv: InvoiceRow }) {
  return (
    <Row
      href={`/facturas/${inv.id}`}
      icon={<Icon name="doc" />}
      title={inv.cliente_snapshot?.nombre ?? "Cliente"}
      subtitle={`${inv.numero} · ${dateES(inv.fecha)}${inv.tipo !== "F1" ? " · Rectificativa" : ""}`}
      right={
        <div className="flex flex-col items-end gap-1">
          <div className="font-display text-xl font-bold tnum">{eur(Number(inv.total))}</div>
          <Badge tone={inv.pagada ? "good" : "mid"}>{inv.pagada ? "Cobrada" : "Pendiente"}</Badge>
        </div>
      }
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mx-1 mb-2 mt-[18px] text-xs font-bold uppercase tracking-[0.16em] text-dim">{children}</div>;
}

function Tabs() {
  return (
    <div className="mb-3.5 flex gap-2">
      <span className="rounded-[13px] border-[1.5px] border-amber bg-amber-soft px-4 py-2.5 text-sm font-bold text-amber">
        Emitidas
      </span>
      <Link href="/facturas/externas" className="rounded-[13px] border-[1.5px] border-line bg-panel px-4 py-2.5 text-sm font-bold text-text">
        Externas
      </Link>
    </div>
  );
}
