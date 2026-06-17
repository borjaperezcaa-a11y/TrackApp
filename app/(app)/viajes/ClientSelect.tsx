"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { quickCreateClient } from "../clientes/actions";

type ClientOption = { id: string; nombre: string };

/** Desplegable de cliente + alta rápida en un modal (sin salir del formulario). */
export function ClientSelect({
  clients,
  name = "client_id",
  defaultValue = "",
}: {
  clients: ClientOption[];
  name?: string;
  defaultValue?: string;
}) {
  const [list, setList] = useState(clients);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [nif, setNif] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    if (!nombre.trim()) {
      setErr("El nombre es obligatorio");
      return;
    }
    setCreating(true);
    const res = await quickCreateClient({ nombre: nombre.trim(), nif: nif.trim() });
    setCreating(false);
    if (res.error || !res.id || !res.nombre) {
      setErr(res.error ?? "No se pudo crear el cliente.");
      return;
    }
    const nuevo = { id: res.id, nombre: res.nombre };
    setList((l) => [...l, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
    setValue(nuevo.id);
    setOpen(false);
    setNombre("");
    setNif("");
  }

  return (
    <>
      <select name={name} value={value} onChange={(e) => setValue(e.target.value)} required>
        <option value="" disabled>
          Selecciona un cliente…
        </option>
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          setErr(null);
          setNombre("");
          setNif("");
          setOpen(true);
        }}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-line bg-amber-soft py-2.5 text-[13.5px] font-bold text-amber transition-transform active:scale-[0.98]"
      >
        <Icon name="plus" size={16} /> Nuevo cliente
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/55 p-4 sm:items-center"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-xl">
              <h3 className="mb-3 font-display text-lg font-bold">Nuevo cliente</h3>
              <Field label="Nombre" htmlFor="nc-nombre">
                <input
                  id="nc-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Transportes García S.L."
                  autoFocus
                />
              </Field>
              <Field label="NIF / CIF" htmlFor="nc-nif" hint="Opcional">
                <input id="nc-nif" value={nif} onChange={(e) => setNif(e.target.value)} placeholder="B12345674" />
              </Field>
              {err && (
                <p className="mb-2 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{err}</p>
              )}
              <div className="mt-1 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-[16px] border border-line bg-panel py-3.5 text-sm font-bold text-text"
                >
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
        )}
    </>
  );
}
