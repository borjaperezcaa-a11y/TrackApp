"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { Icon } from "@/components/ui/Icon";
import type { TripState } from "./actions";

const TRIP_DRAFT = "trip-draft";

export type TripValues = {
  fecha: string;
  client_id: string;
  origen: string;
  destino: string;
  descripcion: string;
  peso: string;
  peso_unidad: "t" | "kg";
  km: string;
  importe: string;
};

type ClientOption = { id: string; nombre: string };

const initial: TripState = {};

export function TripForm({
  action,
  values,
  clients,
  submitLabel,
}: {
  action: (prev: TripState, formData: FormData) => Promise<TripState>;
  values: TripValues;
  clients: ClientOption[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initial);
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);

  // Al volver de crear un cliente, restaura lo que ya habías escrito en el viaje
  // (el cliente lo fija la página con el recién creado).
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    try {
      const raw = sessionStorage.getItem(TRIP_DRAFT);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, string>;
        for (const [k, v] of Object.entries(d)) {
          if (k === "client_id") continue; // lo preselecciona la página
          const el = form.elements.namedItem(k) as HTMLInputElement | null;
          if (el) el.value = v;
        }
        sessionStorage.removeItem(TRIP_DRAFT);
      }
    } catch {
      /* sessionStorage no disponible */
    }
  }, []);

  function goNuevoCliente() {
    const form = formRef.current;
    if (form) {
      try {
        const draft: Record<string, string> = {};
        new FormData(form).forEach((v, k) => {
          draft[k] = String(v);
        });
        sessionStorage.setItem(TRIP_DRAFT, JSON.stringify(draft));
      } catch {
        /* ignore */
      }
    }
    router.push(`/clientes/nuevo?next=${encodeURIComponent(pathname)}`);
  }

  if (clients.length === 0) {
    return (
      <div className="mt-8 text-center">
        <p className="text-[15px] font-semibold">Primero necesitas un cliente</p>
        <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-dim">
          Un viaje se asigna a un cliente para poder facturarlo.
        </p>
        <Link
          href="/clientes/nuevo"
          className="mt-5 inline-flex rounded-2xl bg-amber px-5 py-3 text-sm font-extrabold text-[#1a1205]"
        >
          Crear cliente
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="stagger">
      <Field label="Fecha" htmlFor="fecha">
        <input id="fecha" name="fecha" type="date" defaultValue={values.fecha} required />
      </Field>

      <Field label="Cliente" htmlFor="client_id">
        <select id="client_id" name="client_id" defaultValue={values.client_id} required>
          <option value="" disabled>
            Selecciona un cliente…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={goNuevoCliente}
          className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-amber"
        >
          <Icon name="plus" size={15} /> Nuevo cliente
        </button>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Origen" htmlFor="origen" hint="Con CP: Santiago (15890)">
          <input id="origen" name="origen" defaultValue={values.origen} placeholder="Santiago (15890)" />
        </Field>
        <Field label="Destino" htmlFor="destino" hint="Parma - IT (43122)">
          <input id="destino" name="destino" defaultValue={values.destino} placeholder="Irún (20305)" />
        </Field>
      </div>

      <Field label="Descripción de la carga" htmlFor="descripcion" hint="Opcional · tipo de carga, observaciones…">
        <input id="descripcion" name="descripcion" defaultValue={values.descripcion} placeholder="Fruta · carga completa" />
      </Field>

      <Field label="Peso de la carga" htmlFor="peso" hint="Para el €/tonelada-km en estadísticas">
        <div className="flex gap-2">
          <input
            id="peso"
            name="peso"
            type="number"
            step="0.001"
            min="0"
            inputMode="decimal"
            defaultValue={values.peso}
            placeholder="24"
            className="flex-1"
          />
          <select name="peso_unidad" defaultValue={values.peso_unidad} className="w-24 flex-none">
            <option value="t">t</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Km" htmlFor="km">
          <input id="km" name="km" type="number" step="1" min="0" inputMode="numeric" defaultValue={values.km} placeholder="940" />
        </Field>
        <Field label="Importe (€)" htmlFor="importe">
          <input
            id="importe"
            name="importe"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={values.importe}
            placeholder="1240.00"
            required
            className="font-display !text-2xl"
          />
        </Field>
      </div>

      {state.error && (
        <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
          {state.error}
        </p>
      )}

      <Cta icon="save">{submitLabel}</Cta>
    </form>
  );
}
