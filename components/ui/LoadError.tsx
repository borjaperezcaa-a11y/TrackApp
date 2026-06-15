"use client";

import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/**
 * Panel de error de carga para listados. Se muestra cuando la consulta a la BD
 * falla, para no confundir un fallo con "no hay datos". Incluye reintento.
 */
export function LoadError({ message }: { message?: string }) {
  const router = useRouter();
  return (
    <div className="mt-8 rounded-2xl border border-red/40 bg-red-soft px-5 py-6 text-center">
      <p className="text-[15px] font-bold text-red">No se pudieron cargar los datos</p>
      <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] text-dim">
        {message ?? "Puede ser un problema de conexión. Inténtalo de nuevo."}
      </p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-amber px-5 py-2.5 text-[13px] font-extrabold text-[#1a1205] transition-transform active:scale-95"
      >
        <Icon name="check" size={16} />
        Reintentar
      </button>
    </div>
  );
}
