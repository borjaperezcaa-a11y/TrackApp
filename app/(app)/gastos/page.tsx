import { PageHeader } from "@/components/ui/PageHeader";
import { Row } from "@/components/ui/Row";
import { Fab } from "@/components/ui/Fab";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/server";
import { eur, dateES } from "@/lib/format";

export const metadata = { title: "Gastos · TrackApp" };

type ExpenseRow = {
  id: string;
  categoria: string | null;
  estacion: string | null;
  fecha: string | null;
  total: number;
};

export default async function GastosPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .select("id, categoria, estacion, fecha, total")
    .order("fecha", { ascending: false });
  const expenses = (data ?? []) as ExpenseRow[];

  return (
    <>
      <PageHeader title="Gastos" kicker="Registrados" />

      {expenses.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-[15px] font-semibold">Aún no tienes gastos</p>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] text-dim">
            Haz una foto a un ticket y la IA lo registra por ti. Verás tu margen real y el €/km.
          </p>
        </div>
      ) : (
        <div className="stagger">
          {expenses.map((e) => (
            <Row
              key={e.id}
              href={`/gastos/${e.id}`}
              icon={<Icon name={e.categoria === "Gasoil" ? "fuel" : "euro"} />}
              title={[e.categoria, e.estacion].filter(Boolean).join(" · ") || "Gasto"}
              subtitle={e.fecha ? dateES(e.fecha) : undefined}
              right={<div className="font-display text-xl font-bold tnum">{eur(Number(e.total))}</div>}
            />
          ))}
        </div>
      )}

      <Fab href="/gastos/nuevo" label="Nuevo gasto" />
    </>
  );
}
