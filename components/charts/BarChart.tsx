import { eur } from "@/lib/format";

export type BarDatum = { label: string; ingresos: number; gastos: number };

/**
 * Barras agrupadas ingresos (verde) vs gastos (ámbar) por bucket.
 * Accesible: role=img + tabla oculta para lectores de pantalla. Nunca solo color
 * (leyenda con texto). Animación de crecimiento por CSS (respeta reduce-motion).
 */
export function BarChart({ data, showGastos = true }: { data: BarDatum[]; showGastos?: boolean }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.ingresos, showGastos ? d.gastos : 0]));

  return (
    <figure className="m-0">
      <div
        className="flex h-[150px] items-end gap-2.5 px-0.5 pt-1.5"
        role="img"
        aria-label={
          "Ingresos vs gastos por periodo. " +
          data.map((d) => `${d.label}: ingresos ${eur(d.ingresos)}, gastos ${eur(d.gastos)}`).join("; ")
        }
      >
        {data.map((d, i) => (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <span
                className="grow-y w-[15px] rounded-t-[5px]"
                style={{
                  height: `${(d.ingresos / max) * 100}%`,
                  minHeight: 3,
                  background: "var(--green)",
                  animationDelay: `${i * 0.06}s`,
                }}
              />
              {showGastos && (
                <span
                  className="grow-y w-[15px] rounded-t-[5px]"
                  style={{
                    height: `${(d.gastos / max) * 100}%`,
                    minHeight: 3,
                    background: "var(--amber)",
                    animationDelay: `${i * 0.06 + 0.03}s`,
                  }}
                />
              )}
            </div>
            <span className="text-[10.5px] font-bold text-dim">{d.label}</span>
          </div>
        ))}
      </div>

      <figcaption className="mt-3 flex justify-center gap-[18px] text-xs font-semibold text-dim">
        <span>
          <i className="mr-1.5 inline-block h-[11px] w-[11px] -translate-y-px rounded-[3px] align-middle" style={{ background: "var(--green)" }} />
          Ingresos
        </span>
        {showGastos && (
          <span>
            <i className="mr-1.5 inline-block h-[11px] w-[11px] -translate-y-px rounded-[3px] align-middle" style={{ background: "var(--amber)" }} />
            Gastos
          </span>
        )}
      </figcaption>

      <table className="sr-only">
        <thead>
          <tr>
            <th>Periodo</th>
            <th>Ingresos</th>
            {showGastos && <th>Gastos</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>{eur(d.ingresos)}</td>
              {showGastos && <td>{eur(d.gastos)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
