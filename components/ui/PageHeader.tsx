"use client";

import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/** Cabecera de página con botón de volver, igual que pageHead() del mockup. */
export function PageHeader({
  title,
  kicker,
  fallbackHref = "/",
}: {
  title: string;
  kicker?: string;
  fallbackHref?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  }

  return (
    <header className="flex items-center gap-3.5 px-0.5 pb-4 pt-2">
      <button
        type="button"
        onClick={goBack}
        aria-label="Volver"
        className="grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] border border-line bg-panel text-text transition-transform active:scale-90"
      >
        <Icon name="back" />
      </button>
      <div>
        {kicker && (
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-dim">
            {kicker}
          </div>
        )}
        <h1 className="font-display text-2xl font-bold leading-[1.05] tracking-[0.3px]">{title}</h1>
      </div>
    </header>
  );
}
