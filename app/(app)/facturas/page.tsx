import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Row } from "@/components/ui/Row";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { LoadError } from "@/components/ui/LoadError";
import { createClient } from "@/lib/supabase/server";
import { eur, dateES } from "@/lib/format";
import type { ClienteSnapshot } from "@/lib/types";

export const metadata = { title: "Facturación · TrackApp" };

type InvoiceRow = {
  id: string;
  numero: string;
  fecha: string;
  total: number;
  pagada: boolean;
  tipo: string;
  rectifica_id: string | null;
  cliente_snapshot: ClienteSnapshot;
};

// Estado de una factura original respecto a sus rectificativas.
type Mark = "anulada" | "rectificada";

export default async function FacturasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, numero, fecha, total, pagada, tipo, rectifica_id, cliente_snapshot")
    // pagada=false (pendientes) primero; dentro de cada grupo, las más recientes arriba.
    .order("pagada", { ascending: true })
    .order("emitida_at", { ascending: false });
  const invoices = (data ?? []) as InvoiceRow[];

  // Marca las facturas ORIGINALES que tienen una rectificativa apuntándolas:
  // "anulada" si la rectificativa las deja a cero (importe negativo equivalente),
  // "rectificada" si solo las corrige por diferencias (la original sigue válida).
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const markById = new Map<string, Mark>();
  for (const inv of invoices) {
    if (inv.rectifica_id && byId.has(inv.rectifica_id)) {
      const orig = byId.get(inv.rectifica_id)!;
      const esAnulacion = Number(inv.total) < 0 && Math.abs(Number(inv.total) + Number(orig.total)) < 0.01;
      markById.set(orig.id, esAnulacion ? "anulada" : "rectificada");
    }
  }

  const pendientes = invoices.filter((i) => !i.pagada);
  const cobradas = invoices.filter((i) => i.pagada);

  return (
    <>
      <PageHeader title="Facturación" kicker="Emitidas" hideBack actionHref="/facturas/nueva" actionLabel="Nueva factura" />

      <Tabs />

      {error ? (
        <LoadError />
      ) : invoices.length === 0 ? (
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
              <SectionLabel>Pendientes de cobro</SectionLabel>
              {pendientes.map((inv) => (
                <InvoiceRowItem key={inv.id} inv={inv} mark={markById.get(inv.id)} />
              ))}
            </>
          )}
          {cobradas.length > 0 && (
            <>
              <SectionLabel>Cobradas</SectionLabel>
              {cobradas.map((inv) => (
                <InvoiceRowItem key={inv.id} inv={inv} mark={markById.get(inv.id)} />
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}

function InvoiceRowItem({ inv, mark }: { inv: InvoiceRow; mark?: Mark }) {
  const esRectificativa = inv.tipo !== "F1";
  return (
    <Row
      href={`/facturas/${inv.id}`}
      icon={<Icon name="doc" />}
      title={inv.cliente_snapshot?.nombre ?? "Cliente"}
      subtitle={`${inv.numero} · ${dateES(inv.fecha)}`}
      right={
        <div className="flex flex-col items-end gap-1">
          <div className="font-display text-xl font-bold tnum">{eur(Number(inv.total))}</div>
          {esRectificativa ? (
            // La fila ES una rectificativa.
            <Badge tone="mid">Rectificativa</Badge>
          ) : mark === "anulada" ? (
            // Factura anulada por una rectificativa: queda sin efecto.
            <Badge tone="bad">Anulada</Badge>
          ) : (
            <>
              <Badge tone={inv.pagada ? "good" : "mid"}>{inv.pagada ? "Cobrada" : "Pendiente de cobro"}</Badge>
              {mark === "rectificada" && <Badge tone="mid">Rectificada</Badge>}
            </>
          )}
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
