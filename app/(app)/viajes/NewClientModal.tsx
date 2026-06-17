"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Field } from "@/components/ui/Field";
import { quickCreateClient } from "../clientes/actions";

/** Modal compartido para dar de alta un cliente sin salir del formulario. */
export function NewClientModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: { id: string; nombre: string }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [nif, setNif] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (!nombre.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setCreating(true);
    const res = await quickCreateClient({ nombre: nombre.trim(), nif: nif.trim() });
    setCreating(false);
    if (res.error || !res.id || !res.nombre) {
      setError(res.error ?? "No se pudo crear el cliente.");
      return;
    }
    onCreated({ id: res.id, nombre: res.nombre });
    setNombre("");
    setNif("");
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-xl">
        <h3 className="mb-3 font-display text-lg font-bold">Nuevo cliente</h3>
        <Field label="Nombre" htmlFor="nc-nombre">
          <input id="nc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Transportes García S.L." autoFocus />
        </Field>
        <Field label="NIF / CIF" htmlFor="nc-nif" hint="Opcional">
          <input id="nc-nif" value={nif} onChange={(e) => setNif(e.target.value)} placeholder="B12345674" />
        </Field>
        {error && <p className="mb-2 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{error}</p>}
        <div className="mt-1 flex gap-2.5">
          <button type="button" onClick={onClose} className="flex-1 rounded-[16px] border border-line bg-panel py-3.5 text-sm font-bold text-text">
            Cancelar
          </button>
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="flex-1 rounded-[16px] bg-amber py-3.5 text-sm font-extrabold text-[#1a1205] transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            {creating ? "Creando…" : "Crear cliente"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
