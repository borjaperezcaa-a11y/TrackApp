import Link from "next/link";
import { Icon } from "./Icon";

/**
 * Botón flotante "+" (zona del pulgar). Se mantiene dentro de la columna de la
 * app (max 480px) aunque la posición sea fija respecto al viewport.
 */
export function Fab({ href, label = "Añadir" }: { href: string; label?: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto h-0 max-w-[480px] px-[18px]">
      <Link
        href={href}
        aria-label={label}
        className="pointer-events-auto absolute bottom-7 right-[18px] flex h-16 w-16 items-center justify-center rounded-[22px] bg-amber text-[#1a1205] shadow-[0_12px_30px_rgba(255,178,62,0.42)] transition-transform active:scale-90"
      >
        <Icon name="plus" size={30} />
      </Link>
    </div>
  );
}
