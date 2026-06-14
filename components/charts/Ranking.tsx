export type RankItem = { title: string; sub?: string; value: string };

/** Ranking (mejores rutas / mejores clientes), estilo .rank del mockup. */
export function Ranking({ items }: { items: RankItem[] }) {
  return (
    <ol className="m-0 list-none p-0">
      {items.map((it, i) => (
        <li
          key={`${it.title}-${i}`}
          className="mb-2.5 flex items-center gap-3.5 rounded-[14px] border border-line bg-panel px-3.5 py-3"
        >
          <span className="grid h-7 w-7 flex-none place-items-center rounded-[9px] bg-amber-soft font-display text-[15px] font-bold text-amber">
            {i + 1}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[14.5px] font-bold">{it.title}</div>
            {it.sub && <div className="mt-0.5 text-xs font-medium text-dim">{it.sub}</div>}
          </div>
          <div className="ml-auto font-display text-lg font-bold tnum">{it.value}</div>
        </li>
      ))}
    </ol>
  );
}
