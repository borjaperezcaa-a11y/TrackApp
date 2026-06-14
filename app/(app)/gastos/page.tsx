import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Gastos · TrackApp" };

export default function GastosPage() {
  return (
    <>
      <PageHeader title="Gastos" kicker="Registrados" />
      <div className="mt-8 flex flex-col items-center text-center">
        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-amber-soft text-amber">
          <Icon name="image" size={34} />
        </div>
        <p className="mt-5 text-[16px] font-bold">Escanea tus tickets</p>
        <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-dim">
          Muy pronto: haz una foto al ticket de gasoil, peaje o dieta y la IA reconoce el importe,
          el IVA, la fecha y el establecimiento, y registra el gasto por ti. Así calcularemos tu
          margen real y el €/km.
        </p>
        <span className="mt-5 inline-flex items-center gap-2 rounded-xl bg-panel2 px-4 py-2 text-xs font-bold text-dim">
          Próximamente · paso 6
        </span>
      </div>
    </>
  );
}
