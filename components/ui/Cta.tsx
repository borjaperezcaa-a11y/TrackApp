"use client";

import { useFormStatus } from "react-dom";
import { Icon, type IconName } from "./Icon";

/**
 * Botón de acción principal (estilo .cta del mockup). Dentro de un <form> con
 * server action se deshabilita solo mientras la acción está en curso.
 */
export function Cta({
  children,
  icon,
  pendingLabel,
  type = "submit",
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  icon?: IconName;
  pendingLabel?: string;
  type?: "submit" | "button";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const busy = pending || disabled;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy}
      className="flex min-h-[64px] w-full items-center justify-center gap-2.5 rounded-[18px] bg-amber px-5 py-5 text-[17px] font-extrabold text-[#1a1205] shadow-[0_12px_26px_rgba(255,178,62,0.30)] transition-transform active:scale-[0.97] disabled:opacity-60"
    >
      {busy ? (
        pendingLabel ?? "Guardando…"
      ) : (
        <>
          {icon && <Icon name={icon} size={22} />}
          {children}
        </>
      )}
    </button>
  );
}
