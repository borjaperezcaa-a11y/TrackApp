import { eur, intES } from "@/lib/format";

export type DonutSlice = { label: string; value: number; pct: number; color: string };

/** Donut de gastos por categoría + leyenda. Accesible (role=img + tabla oculta). */
export function Donut({ slices, total, centerLabel = "Gastos" }: {
  slices: DonutSlice[];
  total: number;
  centerLabel?: string;
}) {
  const r = 52;
  const C = 2 * Math.PI * r;
  let off = 0;

  return (
    <figure
      className="m-0"
      role="img"
      aria-label={
        `${centerLabel}: ${eur(total)}. ` +
        slices.map((s) => `${s.label} ${eur(s.value)}, ${Math.round(s.pct * 100)}%`).join("; ")
      }
    >
      <svg viewBox="0 0 120 120" className="mx-auto block" style={{ width: 148, height: 148, margin: "4px auto 14px" }} aria-hidden="true">
        {slices.map((s) => {
          const seg = (
            <circle
              key={s.label}
              cx={60}
              cy={60}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={15}
              strokeDasharray={`${(s.pct * C).toFixed(1)} ${(C - s.pct * C).toFixed(1)}`}
              strokeDashoffset={(-off * C).toFixed(1)}
              transform="rotate(-90 60 60)"
            />
          );
          off += s.pct;
          return seg;
        })}
        <text x={60} y={55} textAnchor="middle" fill="var(--dim)" fontSize={9} fontFamily="Archivo">
          {centerLabel}
        </text>
        <text x={60} y={73} textAnchor="middle" fill="var(--text)" fontSize={15} fontWeight={700} fontFamily="Saira Condensed">
          {intES(total)} €
        </text>
      </svg>

      <div>
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 border-t border-line py-2 text-[13.5px] font-semibold first:border-t-0">
            <span className="h-3 w-3 flex-none rounded" style={{ background: s.color }} />
            <span className="flex-1">{s.label}</span>
            <span className="tnum">{eur(s.value)}</span>
            <span className="w-10 text-right text-dim">{Math.round(s.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
