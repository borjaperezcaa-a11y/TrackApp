"use client";

import { useActionState, useState } from "react";
import { clsx } from "@/lib/clsx";

type DeleteState = { error?: string };

/**
 * Botón de borrado con confirmación en dos pasos. Recibe un server action ya
 * enlazado al id, con firma (prev, formData) => Promise<{ error? }>.
 */
export function ConfirmDelete({
  action,
  label,
  question,
}: {
  action: (prev: DeleteState, formData: FormData) => Promise<DeleteState>;
  label: string;
  question: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <div className="mt-3">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-[18px] border border-red/40 bg-red-soft py-4 text-sm font-bold text-red transition-transform active:scale-[0.97]"
        >
          {label}
        </button>
      ) : (
        <form action={formAction}>
          <p className="mb-2 text-center text-sm font-semibold text-dim">{question}</p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-[18px] border border-line bg-panel py-4 text-sm font-bold text-text"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className={clsx(
                "flex-1 rounded-[18px] bg-red py-4 text-sm font-extrabold text-white transition-transform active:scale-[0.97]",
                pending && "opacity-60",
              )}
            >
              {pending ? "Borrando…" : "Sí, borrar"}
            </button>
          </div>
        </form>
      )}
      {state.error && (
        <p className="mt-2 rounded-xl bg-red-soft px-3 py-2 text-center text-sm font-semibold text-red">
          {state.error}
        </p>
      )}
    </div>
  );
}
