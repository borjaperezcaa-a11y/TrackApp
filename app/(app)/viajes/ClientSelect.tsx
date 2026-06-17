"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { NewClientModal } from "./NewClientModal";

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
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-line bg-amber-soft py-2.5 text-[13.5px] font-bold text-amber transition-transform active:scale-[0.98]"
      >
        <Icon name="plus" size={16} /> Nuevo cliente
      </button>

      <NewClientModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(c) => {
          setList((l) => [...l, c].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
          setValue(c.id);
          setOpen(false);
        }}
      />
    </>
  );
}
