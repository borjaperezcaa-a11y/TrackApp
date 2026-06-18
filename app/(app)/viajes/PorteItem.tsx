"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { eur } from "@/lib/format";
import { PorteForm, type PorteInitial } from "./PorteForm";
import type { TripState } from "./actions";

type ClientOption = { id: string; nombre: string };

/**
 * Una fila de porte en el detalle del viaje. Si está pendiente, permite editarlo
 * (despliega el formulario en línea, prerrellenado) o quitarlo. Si está
 * facturado, es de solo lectura y enlaza a su factura.
 */
export function PorteItem({
  clientName,
  ruta,
  descripcion,
  importe,
  facturado,
  invoiceId,
  clients,
  initial,
  updateAction,
  deleteAction,
}: {
  clientName: string;
  ruta: string;
  descripcion: string | null;
  importe: number;
  facturado: boolean;
  invoiceId: string | null;
  clients: ClientOption[];
  initial: PorteInitial;
  updateAction: (prev: TripState, formData: FormData) => Promise<TripState>;
  deleteAction: (prev: TripState, formData: FormData) => Promise<TripState>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card soft className="mb-2.5">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold">Editar porte</div>
          <button type="button" onClick={() => setEditing(false)} className="text-[13px] font-bold text-dim">
            Cancelar
          </button>
        </div>
        <PorteForm action={updateAction} clients={clients} initial={initial} submitLabel="GUARDAR CAMBIOS" />
      </Card>
    );
  }

  return (
    <Card soft className="mb-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{clientName}</div>
          <div className="mt-0.5 truncate text-[12.5px] text-dim">{ruta}</div>
          {descripcion && <div className="mt-0.5 text-[12.5px]">{descripcion}</div>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="font-display text-lg font-bold tnum">{eur(importe)}</div>
          <Badge tone={facturado ? "good" : "mid"}>{facturado ? "Facturado" : "Pendiente"}</Badge>
        </div>
      </div>

      {facturado ? (
        invoiceId && (
          <Link href={`/facturas/${invoiceId}`} className="mt-2 inline-flex text-[13px] font-bold text-amber">
            Ver factura ›
          </Link>
        )
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-amber"
          >
            <Icon name="edit" size={14} /> Editar porte
          </button>
          <ConfirmDelete action={deleteAction} label="Quitar porte" question="¿Quitar este porte del viaje?" />
        </>
      )}
    </Card>
  );
}
