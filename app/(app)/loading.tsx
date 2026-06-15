/** Esqueleto de carga: se muestra al navegar a cualquier sección mientras el
 *  servidor obtiene los datos. Da feedback inmediato (sensación de fluidez). */
export default function Loading() {
  return (
    <div className="animate-pulse pt-2" aria-busy="true" aria-label="Cargando">
      {/* cabecera */}
      <div className="flex items-center gap-3.5 px-0.5 pb-4 pt-2">
        <div className="h-[46px] w-[46px] flex-none rounded-[14px] bg-panel2" />
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-panel2" />
          <div className="h-5 w-40 rounded bg-panel2" />
        </div>
      </div>

      {/* filas de lista */}
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 rounded-2xl border border-line bg-panel px-4 py-3.5">
            <div className="h-[42px] w-[42px] flex-none rounded-xl bg-panel2" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/2 rounded bg-panel2" />
              <div className="h-3 w-1/3 rounded bg-panel2" />
            </div>
            <div className="h-5 w-16 rounded bg-panel2" />
          </div>
        ))}
      </div>
    </div>
  );
}
