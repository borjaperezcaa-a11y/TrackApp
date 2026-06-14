"use client";

import { useActionState, useState } from "react";
import { clsx } from "@/lib/clsx";
import { deleteClientAction, type ClientState } from "./actions";

const initial: ClientState = {};

export function DeleteClientButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(deleteClientAction.bind(null, id), initial);

  return (
    <div className="mt-3">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-[18px] border border-red/40 bg-red-soft py-4 text-sm font-bold text-red transition-transform active:scale-[0.97]"
        >
          Borrar cliente
        </button>
      ) : (
        <form action={formAction}>
          <p className="mb-2 text-center text-sm font-semibold text-dim">
            ¿Seguro que quieres borrar este cliente?
          </p>
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
