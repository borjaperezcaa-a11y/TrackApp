import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { LoadError } from "@/components/ui/LoadError";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Registro de eventos · TrackApp" };

type EventRow = {
  id: number;
  tipo: string;
  detalle: Record<string, unknown> | null;
  entidad: string | null;
  huella: string;
  created_at: string;
};

const LABELS: Record<string, string> = {
  factura_emitida: "Factura emitida",
  factura_anulada: "Factura anulada (rectificativa)",
  factura_rectificada: "Factura rectificada por diferencias",
  factura_externa_registrada: "Factura externa registrada",
  factura_externa_editada: "Factura externa editada",
  factura_externa_borrada: "Factura externa borrada",
  numeracion_configurada: "Numeración configurada",
};

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

function resumen(e: EventRow): string | null {
  const d = e.detalle ?? {};
  const partes: string[] = [];
  if (typeof d.numero === "string") partes.push(d.numero);
  if (typeof d.serie === "string" && typeof d.num_inicial === "number")
    partes.push(`${d.serie} · desde ${d.num_inicial}`);
  if (typeof d.motivo === "string" && d.motivo) partes.push(`“${d.motivo}”`);
  return partes.length ? partes.join(" · ") : null;
}

export default async function EventosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("system_events")
    .select("id, tipo, detalle, entidad, huella, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  const eventos = (data ?? []) as EventRow[];

  return (
    <>
      <PageHeader title="Registro de eventos" kicker="Verifactu · Art. 8.3" fallbackHref="/ajustes" />
      <p className="mb-4 px-1 text-[12.5px] text-dim">
        Registro automático e inalterable de las operaciones del sistema (emisión, rectificación,
        facturas externas…). Cada evento se encadena con una huella SHA-256, de modo que cualquier
        manipulación se detecta.
      </p>

      {error ? (
        <LoadError />
      ) : eventos.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-[15px] font-semibold">Aún no hay eventos registrados</p>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] text-dim">
            En cuanto emitas una factura o registres una externa, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="stagger">
          {eventos.map((e) => {
            const r = resumen(e);
            return (
              <div
                key={e.id}
                className="mb-2.5 flex items-start gap-3 rounded-2xl border border-line bg-panel px-4 py-3"
              >
                <div className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl bg-panel2 text-amber">
                  <Icon name="check" size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold">{LABELS[e.tipo] ?? e.tipo}</div>
                  <div className="mt-0.5 text-[12px] text-dim">{fechaHora(e.created_at)}</div>
                  {r && <div className="mt-0.5 truncate text-[12.5px] font-medium">{r}</div>}
                  <code className="mt-1 block truncate text-[10px] text-dim" title={e.huella}>
                    {e.huella.slice(0, 24)}…
                  </code>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
