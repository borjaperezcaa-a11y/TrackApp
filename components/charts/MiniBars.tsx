import { eur } from "@/lib/format";
import { MONTH_SHORT } from "@/lib/fiscal";

export type MiniPoint = { month0: number; ingresos: number; gastos: number };

/** Mini-gráfica ingresos (verde) vs gastos (ámbar) de los últimos meses (home). */
export function MiniBars({ data }: { data: MiniPoint[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.ingresos, d.gastos]));
  return (
    <div
      className="flex h-[70px] items-end gap-2.5"
      role="img"
      aria-label={
        "Ingresos vs gastos por mes: " +
        data.map((d) => `${MONTH_SHORT[d.month0]} ingresos ${eur(d.ingresos)}`).join("; ")
      }
    >
      {data.map((d, i) => (
        <div key={d.month0} className="flex h-full flex-1 flex-col justify-end gap-[3px]">
          <span
            className="grow-y rounded-t-[4px]"
            style={{ height: `${(d.gastos / max) * 42}%`, minHeight: 3, background: "var(--amber)", animationDelay: `${i * 0.05 + 0.03}s` }}
          />
          <span
            className="grow-y rounded-t-[4px]"
            style={{ height: `${(d.ingresos / max) * 100}%`, minHeight: 3, background: "var(--green)", animationDelay: `${i * 0.05}s` }}
          />
        </div>
      ))}
    </div>
  );
}
