import { PageHeader } from "@/components/ui/PageHeader";
import { Row } from "@/components/ui/Row";
import { Badge } from "@/components/ui/Badge";
import { Fab } from "@/components/ui/Fab";
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
    .order("emitida_at", { ascending: false });
  const invoices = (data ?? []) as InvoiceRow[];

  return (
    <>
      <PageHeader title="Facturas" kicker="Emitidas" />

      {invoices.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-[15px] font-semibold">Aún no has emitido facturas</p>
          <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-dim">
            Genera tu primera factura a partir de los viajes pendientes de un cliente.
          </p>
        </div>
      ) : (
        <div className="stagger">
          {invoices.map((inv) => (
            <Row
              key={inv.id}
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
          ))}
        </div>
      )}

      <Fab href="/facturas/nueva" label="Nueva factura" />
    </>
  );
}
