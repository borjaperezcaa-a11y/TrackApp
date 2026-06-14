import Link from "next/link";
import { clsx } from "@/lib/clsx";

/**
 * Fila de lista (estilo .row del mockup). Sirve para clientes, viajes y
 * facturas. Avatar de iniciales o icono a la izquierda; contenido a la derecha.
 */
export function Row({
  href,
  avatar,
  icon,
  title,
  subtitle,
  right,
}: {
  href?: string;
  avatar?: string;
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const inner = (
    <>
      <div
        className={clsx(
          "grid h-[42px] w-[42px] flex-none place-items-center rounded-xl bg-panel2 text-amber",
          avatar && "font-display text-base font-bold",
        )}
      >
        {avatar ?? icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[15.5px] font-bold">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-[12.5px] font-medium text-dim">{subtitle}</div>}
      </div>
      {right && <div className="ml-auto pl-2 text-right">{right}</div>}
    </>
  );

  const cls =
    "flex items-center gap-3.5 rounded-2xl border border-line bg-panel px-4 py-3.5 transition-transform active:scale-[0.985]";

  return href ? (
    <Link href={href} className={clsx(cls, "mb-2.5")}>
      {inner}
    </Link>
  ) : (
    <div className={clsx(cls, "mb-2.5")}>{inner}</div>
  );
}
