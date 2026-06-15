"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/** Cabecera de página con botón de volver, igual que pageHead() del mockup.
 *  - hideBack: para las pantallas raíz (con barra de navegación inferior) que
 *    no necesitan "volver".
 *  - actionHref/actionLabel: botón "+" a la derecha (sustituye al FAB). */
export function PageHeader({
  title,
  kicker,
  fallbackHref = "/",
  hideBack = false,
  actionHref,
  actionLabel,
}: {
  title: string;
  kicker?: string;
  fallbackHref?: string;
  hideBack?: boolean;
  actionHref?: string;
  actionLabel?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  }

  return (
    <header className="flex items-center gap-3.5 px-0.5 pb-4 pt-2">
      {!hideBack && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Volver"
          className="grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] border border-line bg-panel text-text transition-transform active:scale-90"
        >
          <Icon name="back" />
        </button>
      )}
      <div className="min-w-0">
        {kicker && (
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-dim">
            {kicker}
          </div>
        )}
        <h1 className="truncate font-display text-2xl font-bold leading-[1.05] tracking-[0.3px]">
          {title}
        </h1>
      </div>
      {actionHref && (
        <Link
          href={actionHref}
          aria-label={actionLabel ?? "Añadir"}
          className="ml-auto grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] bg-amber text-[#1a1205] shadow-[0_6px_16px_rgba(255,178,62,0.30)] transition-transform active:scale-90"
        >
          <Icon name="plus" size={24} />
        </Link>
      )}
    </header>
  );
}
