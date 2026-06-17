"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { clsx } from "@/lib/clsx";
import { computeInvoiceTotals } from "@/lib/invoice";
import { eur, amount, dateES } from "@/lib/format";
import { emitInvoiceAction } from "../actions";
import type { EmitPayload } from "../types";

type ProfileData = {
  nombre: string;
  nif: string;
  direccion: string;
  cp_localidad: string;
  iban: string;
  logo_url: string;
  iva_def: number;
  irpf_def: number;
};
type ClientData = {
  id: string;
  nombre: string;
  nif: string;
  direccion: string;
  cp_localidad: string;
  condiciones_pago: string;
};
type PendingTrip = {
  id: string;
  fecha: string;
  origen: string;
  destino: string;
  importe: number;
  client_id: string;
};

type LineState = {
  trip_id: string;
  include: boolean;
  fecha: string;
  origen: string;
  destino: string;
  cantidad: string;
  precio: string;
};

const IVA_OPTS = [21, 10, 4, 0];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildLines(pendingTrips: PendingTrip[], clientId: string): LineState[] {
  return pendingTrips
    .filter((t) => t.client_id === clientId)
    .map((t) => ({
      trip_id: t.id,
      include: true,
      fecha: t.fecha,
      origen: t.origen ?? "",
      destino: t.destino ?? "",
      cantidad: "1",
      precio: String(t.importe),
    }));
}

export function NuevaFacturaWizard({
  profile,
  clients,
  pendingTrips,
}: {
  profile: ProfileData;
  clients: ClientData[];
  pendingTrips: PendingTrip[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false); // guard anti doble-emisión (toque rápido en móvil)
  const [error, setError] = useState<string | null>(null);

  // Clientes que tienen al menos un viaje pendiente.
  const billableClients = useMemo(() => {
    const withTrips = new Set(pendingTrips.map((t) => t.client_id));
    return clients.filter((c) => withTrips.has(c.id));
  }, [clients, pendingTrips]);

  const initialClientId = billableClients[0]?.id ?? "";
  const [clientId, setClientId] = useState<string>(initialClientId);
  const client = clients.find((c) => c.id === clientId);

  // Datos editables del emisor y del cliente (overrides del snapshot).
  const [emisor] = useState({
    nombre: profile.nombre,
    nif: profile.nif,
    direccion: profile.direccion,
    cp_localidad: profile.cp_localidad,
    iban: profile.iban,
  });
  const [cliente, setCliente] = useState({
    nombre: client?.nombre ?? "",
    nif: client?.nif ?? "",
    direccion: client?.direccion ?? "",
    cp_localidad: client?.cp_localidad ?? "",
    condiciones_pago: client?.condiciones_pago ?? "",
  });

  const [ivaRate, setIvaRate] = useState<number>(profile.iva_def ?? 21);
  const [irpfRate, setIrpfRate] = useState<string>(String(profile.irpf_def ?? 1));
  const [fecha, setFecha] = useState<string>(todayISO());
  const [formaPago, setFormaPago] = useState<string>("Transferencia");

  // Líneas (= viajes pendientes del cliente), todas marcadas por defecto.
  const [lines, setLines] = useState<LineState[]>(() => buildLines(pendingTrips, initialClientId));

  // Cuando cambia el cliente, recargamos sus datos y sus líneas.
  function selectClient(id: string) {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    setCliente({
      nombre: c?.nombre ?? "",
      nif: c?.nif ?? "",
      direccion: c?.direccion ?? "",
      cp_localidad: c?.cp_localidad ?? "",
      condiciones_pago: c?.condiciones_pago ?? "",
    });
    setLines(buildLines(pendingTrips, id));
  }

  function updateLine(i: number, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const included = lines.filter((l) => l.include);
  const totals = useMemo(
    () =>
      computeInvoiceTotals(
        lines
          .filter((l) => l.include)
          .map((l) => ({ cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0 })),
        ivaRate,
        Number(irpfRate) || 0,
      ),
    [lines, ivaRate, irpfRate],
  );

  function emit() {
    setError(null);
    if (included.length === 0) {
      setError("Selecciona al menos un viaje.");
      return;
    }
    const payload: EmitPayload = {
      clientId,
      tripIds: included.map((l) => l.trip_id),
      ivaRate,
      irpfRate: Number(irpfRate) || 0,
      fecha,
      formaPago: formaPago || "Transferencia",
      lines: included.map((l) => ({
        trip_id: l.trip_id,
        fecha: l.fecha,
        origen: l.origen,
        destino: l.destino,
        cantidad: Number(l.cantidad) || 0,
        precio: Number(l.precio) || 0,
      })),
      emisor: { ...emisor, logo_url: profile.logo_url },
      cliente,
    };
    if (inFlight.current) return; // ya hay una emisión en curso
    inFlight.current = true;
    startTransition(async () => {
      try {
        const res = await emitInvoiceAction(payload);
        if (res.error) setError(res.error);
        else if (res.invoiceId) router.push(`/facturas/${res.invoiceId}`);
      } finally {
        inFlight.current = false;
      }
    });
  }

  // Sin datos de emisor (nombre + NIF) no se puede facturar: el camionero debe
  // registrar sus datos primero. (Misma regla validada en el servidor.)
  const profileReady = Boolean(profile.nombre.trim() && profile.nif.trim());
  if (!profileReady) {
    return (
      <div className="mt-8 text-center">
        <p className="text-[15px] font-semibold">Completa tus datos de emisor</p>
        <p className="mx-auto mt-1.5 max-w-[290px] text-[13px] text-dim">
          Para emitir facturas necesitas registrar al menos tu nombre o razón social y tu NIF/CIF
          en “Mis datos”. Esos datos aparecerán como emisor de todas tus facturas.
        </p>
        <Link
          href="/ajustes/perfil"
          className="mt-5 inline-flex rounded-2xl bg-amber px-5 py-3 text-sm font-extrabold text-[#1a1205]"
        >
          Ir a Mis datos
        </Link>
      </div>
    );
  }

  if (billableClients.length === 0) {
    return (
      <div className="mt-8 text-center">
        <p className="text-[15px] font-semibold">No hay viajes pendientes de facturar</p>
        <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] text-dim">
          Registra viajes (en estado pendiente) y asígnalos a un cliente para poder facturarlos.
        </p>
        <Link
          href="/viajes/nuevo"
          className="mt-5 inline-flex rounded-2xl bg-amber px-5 py-3 text-sm font-extrabold text-[#1a1205]"
        >
          Nuevo viaje
        </Link>
      </div>
    );
  }

  const inputSm =
    "w-full rounded-xl border border-line bg-panel2 px-3 py-2.5 text-sm font-semibold text-text outline-none focus:border-amber !text-sm";

  return (
    <div className="stagger pb-4">
      {/* Cliente */}
      <Field label="Cliente">
        <select value={clientId} onChange={(e) => selectClient(e.target.value)}>
          {billableClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Field>

      {/* Portes (selección + edición) */}
      <div className="mb-2 mt-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">
        Portes ({included.length}/{lines.length})
      </div>
      <div className="space-y-2.5">
        {lines.map((l, i) => (
          <Card key={l.trip_id} soft className={clsx("!p-3", !l.include && "opacity-55")}>
            <div className="mb-2 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => updateLine(i, { include: !l.include })}
                aria-label={l.include ? "Quitar de la factura" : "Incluir en la factura"}
                className={clsx(
                  "grid h-6 w-6 flex-none place-items-center rounded-md border-[1.5px] transition-colors",
                  l.include ? "border-amber bg-amber text-[#1a1205]" : "border-line text-transparent",
                )}
              >
                <Icon name="check" size={14} />
              </button>
              <input
                type="date"
                value={l.fecha}
                onChange={(e) => updateLine(i, { fecha: e.target.value })}
                className={inputSm}
              />
              <div className="ml-auto whitespace-nowrap font-display text-base font-bold tnum">
                {eur((Number(l.cantidad) || 0) * (Number(l.precio) || 0))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={l.origen}
                onChange={(e) => updateLine(i, { origen: e.target.value })}
                placeholder="Origen (CP)"
                className={inputSm}
              />
              <input
                value={l.destino}
                onChange={(e) => updateLine(i, { destino: e.target.value })}
                placeholder="Destino (CP)"
                className={inputSm}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={l.cantidad}
                onChange={(e) => updateLine(i, { cantidad: e.target.value })}
                placeholder="Cantidad"
                className={inputSm}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={l.precio}
                onChange={(e) => updateLine(i, { precio: e.target.value })}
                placeholder="Precio"
                className={inputSm}
              />
            </div>
          </Card>
        ))}
      </div>

      {/* Emisor / Cliente (solo lectura: la identidad fiscal se ancla en el
          servidor desde tu perfil y la ficha del cliente, no es editable aquí
          por seguridad/integridad de la factura). */}
      <details className="mt-3 rounded-2xl border border-line bg-panel p-4">
        <summary className="cursor-pointer text-sm font-bold">Emisor y cliente</summary>
        <div className="mt-3 space-y-3 text-[13px]">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-dim">Emisor</div>
            <div className="font-semibold">{emisor.nombre || "—"}</div>
            <div className="text-dim">
              {[emisor.nif, emisor.cp_localidad].filter(Boolean).join(" · ")}
            </div>
            <Link href="/ajustes/perfil" className="text-xs font-bold text-amber">
              Editar en Mis datos ›
            </Link>
          </div>
          <div className="border-t border-line pt-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-dim">Cliente</div>
            <div className="font-semibold">{cliente.nombre || "—"}</div>
            <div className="text-dim">
              {[cliente.nif, cliente.cp_localidad].filter(Boolean).join(" · ")}
            </div>
            {clientId && (
              <Link href={`/clientes/${clientId}`} className="text-xs font-bold text-amber">
                Editar ficha del cliente ›
              </Link>
            )}
          </div>
        </div>
      </details>

      {/* Meta factura */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Fecha factura">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Field label="Forma de pago">
          <input value={formaPago} onChange={(e) => setFormaPago(e.target.value)} />
        </Field>
      </div>

      <Field label="IVA">
        <div className="flex flex-wrap gap-2">
          {IVA_OPTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setIvaRate(v)}
              className={clsx(
                "rounded-[13px] border-[1.5px] px-4 py-2.5 text-sm font-bold transition-all",
                ivaRate === v ? "border-amber bg-amber-soft text-amber" : "border-line bg-panel text-text",
              )}
            >
              {v}%
            </button>
          ))}
        </div>
      </Field>

      <Field label="Retención IRPF (%)" hint="Transporte en módulos: 1%">
        <input
          type="number"
          step="0.5"
          min="0"
          max="100"
          value={irpfRate}
          onChange={(e) => setIrpfRate(e.target.value)}
        />
      </Field>

      {/* Totales en vivo */}
      <Card soft className="mt-1">
        <Row label="Base imponible" value={eur(totals.base)} />
        <Row label={`IVA ${ivaRate}%`} value={eur(totals.iva)} />
        {totals.irpf > 0 && <Row label={`Retención IRPF ${irpfRate}%`} value={`− ${eur(totals.irpf)}`} />}
        <div className="mt-1.5 flex items-center justify-between border-t border-dashed border-line pt-2.5 font-bold">
          <span>Total</span>
          <b className="font-display text-2xl text-amber tnum">{eur(totals.total)}</b>
        </div>
      </Card>

      <p className="mt-3 rounded-2xl border border-amber-line bg-amber-soft px-4 py-3 text-[12px] font-semibold text-amber">
        Verifactu en pruebas: se genera huella encadenada + QR, pero aún NO es facturación oficial
        (no se envía a la AEAT ni se firma con certificado).
      </p>

      {error && (
        <p className="mt-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{error}</p>
      )}

      <button
        type="button"
        onClick={emit}
        disabled={pending || included.length === 0}
        className="mt-3 flex min-h-[64px] w-full items-center justify-center gap-2.5 rounded-[18px] bg-amber px-5 py-5 text-[17px] font-extrabold text-[#1a1205] shadow-[0_12px_26px_rgba(255,178,62,0.30)] transition-transform active:scale-[0.97] disabled:opacity-60"
      >
        {pending ? (
          "Emitiendo…"
        ) : (
          <>
            <Icon name="send" size={22} /> EMITIR FACTURA · {eur(totals.total)}
          </>
        )}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm text-dim">
      <span>{label}</span>
      <b className="text-text tnum">{value}</b>
    </div>
  );
}
