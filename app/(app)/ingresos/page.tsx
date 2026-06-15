import { PageHeader } from "@/components/ui/PageHeader";
import { Row } from "@/components/ui/Row";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { LoadError } from "@/components/ui/LoadError";
import { createClient } from "@/lib/supabase/server";
import { eur, dateES } from "@/lib/format";

export const metadata = { title: "Ingresos · TrackApp" };

type IncomeRow = {
  id: string;
  concepto: string | null;
  cliente: string | null;
  fecha: string | null;
  total: number;
  cobrada: boolean;
};

export default async function IngresosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incomes")
    .select("id, concepto, cliente, fecha, total, cobrada")
    .order("fecha", { ascending: false });
  const incomes = (data ?? []) as IncomeRow[];

  return (
    <>
      <PageHeader title="Ingresos" kicker="Apuntados a mano" hideBack actionHref="/ingresos/nuevo" actionLabel="Nuevo ingreso" />

      {error ? (
        <LoadError />
      ) : incomes.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-[15px] font-semibold">Aún no tienes ingresos apuntados</p>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] text-dim">
            Apunta aquí ingresos que no facturas con la app. No se envían a la AEAT; solo se guardan
            para tu contabilidad.
          </p>
        </div>
      ) : (
        <div className="stagger">
          {incomes.map((i) => (
            <Row
              key={i.id}
              href={`/ingresos/${i.id}`}
              icon={<Icon name="income" />}
              title={i.concepto || i.cliente || "Ingreso"}
              subtitle={[i.fecha ? dateES(i.fecha) : null, i.cliente].filter(Boolean).join(" · ") || undefined}
              right={
                <div className="flex flex-col items-end gap-1">
                  <div className="font-display text-xl font-bold tnum text-green">{eur(Number(i.total))}</div>
                  <Badge tone={i.cobrada ? "good" : "mid"}>{i.cobrada ? "Cobrado" : "Pendiente"}</Badge>
                </div>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
