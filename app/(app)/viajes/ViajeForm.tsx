"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PlaceAutocomplete, type ResolvedPlace } from "@/components/ui/PlaceAutocomplete";
import { DateField } from "@/components/ui/DateField";
import { clsx } from "@/lib/clsx";
import { createViajeAction, type TripState } from "./actions";
import { NewClientModal } from "./NewClientModal";
import { lookupCp } from "@/lib/cp-lookup";

type ClientOption = { id: string; nombre: string };
type Stop = { lugar: string; cp: string }; // parada = localidad + código postal
type PorteDraft = {
  client_id: string;
  origenes: Stop[]; // cargas (puede haber varias = grupaje)
  destinos: Stop[]; // descargas
  descripcion: string;
  peso: string;
  peso_unidad: "t" | "kg";
  importe: string;
};

const initial: TripState = {};
const emptyStop = (): Stop => ({ lugar: "", cp: "" });
const emptyPorte = (): PorteDraft => ({
  client_id: "",
  origenes: [emptyStop()],
  destinos: [emptyStop()],
  descripcion: "",
  peso: "",
  peso_unidad: "kg", // por defecto kg
  importe: "",
});

/**
 * Crea un VIAJE FÍSICO (trayecto + km) con UNA O VARIAS cargas (portes). Cada
 * porte es independiente: su cliente, su importe y, si hace falta, su ruta. Por
 * defecto el porte hereda la ruta del viaje (no hay que repetirla). Los portes se
 * envían serializados (JSON) en un campo oculto a la server action.
 */
export function ViajeForm({
  clients: initialClients,
  vehiculos = [],
  defaultFecha,
  routingEnabled = false,
}: {
  clients: ClientOption[];
  vehiculos?: { id: string; nombre: string }[];
  defaultFecha: string;
  routingEnabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createViajeAction, initial);
  const [clients, setClients] = useState(initialClients);

  // Trayecto físico
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [origenCp, setOrigenCp] = useState("");
  const [destinoCp, setDestinoCp] = useState("");
  const [km, setKm] = useState("");
  const [origenCoord, setOrigenCoord] = useState<ResolvedPlace>(null);
  const [destinoCoord, setDestinoCoord] = useState<ResolvedPlace>(null);
  const [kmStatus, setKmStatus] = useState<"idle" | "calc" | "done" | "error">("idle");

  // Portes (al menos uno) + modo: una carga o varias (multiporte).
  const [portes, setPortes] = useState<PorteDraft[]>([emptyPorte()]);
  const [multi, setMulti] = useState(false);

  function setModo(m: boolean) {
    setMulti(m);
    // Al volver a "una carga" nos quedamos solo con el primer porte.
    if (!m) setPortes((ps) => [ps[0] ?? emptyPorte()]);
  }

  // Modal "nuevo cliente" (guarda a qué porte se asignará el cliente creado)
  const [modalIdx, setModalIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!routingEnabled || !origenCoord || !destinoCoord) return;
    let alive = true;
    setKmStatus("calc");
    fetch("/api/distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: origenCoord, to: destinoCoord }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("distance"))))
      .then((d: { km?: number }) => {
        if (!alive) return;
        if (typeof d.km === "number" && Number.isFinite(d.km)) {
          setKm(String(d.km));
          setKmStatus("done");
        } else setKmStatus("error");
      })
      .catch(() => {
        if (alive) setKmStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [origenCoord, destinoCoord, routingEnabled]);

  function setPorte(i: number, patch: Partial<PorteDraft>) {
    setPortes((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function addPorte() {
    setPortes((ps) => [...ps, emptyPorte()]);
  }
  function removePorte(i: number) {
    setPortes((ps) => (ps.length > 1 ? ps.filter((_, idx) => idx !== i) : ps));
  }

  // Paradas de carga/descarga de un porte (grupaje: varias por porte).
  type StopField = "origenes" | "destinos";
  function setStop(i: number, field: StopField, j: number, key: keyof Stop, val: string) {
    setPortes((ps) =>
      ps.map((p, idx) => (idx === i ? { ...p, [field]: p[field].map((s, k) => (k === j ? { ...s, [key]: val } : s)) } : p)),
    );
  }
  function addStop(i: number, field: StopField) {
    setPortes((ps) => ps.map((p, idx) => (idx === i ? { ...p, [field]: [...p[field], emptyStop()] } : p)));
  }
  function removeStop(i: number, field: StopField, j: number) {
    setPortes((ps) =>
      ps.map((p, idx) => (idx === i ? { ...p, [field]: p[field].length > 1 ? p[field].filter((_, k) => k !== j) : p[field] } : p)),
    );
  }

  // ¿Este porte tiene ruta propia (alguna parada con contenido)? Si no, hereda la
  // ruta del viaje y la sección de paradas aparece plegada.
  const tieneRutaPropia = (p: PorteDraft) =>
    p.origenes.some((s) => s.lugar.trim() || s.cp.trim()) || p.destinos.some((s) => s.lugar.trim() || s.cp.trim());

  // Asistente por pasos: 1) tipo · 2) trayecto · 3) carga(s).
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Al cambiar de paso, lleva el foco al título (accesibilidad / lector de pantalla).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  function goNext() {
    setStepError(null);
    if (step === 2 && (!origen.trim() || !destino.trim())) {
      setStepError("Indica el origen y el destino del viaje.");
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  }
  function goBack() {
    setStepError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  function renderStops(i: number, field: StopField, label: string) {
    const stops = portes[i][field];
    return (
      <div>
        <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-[0.1em] text-dim">{label}</div>
        {stops.map((s, j) => (
          <div key={j} className="mb-1.5 flex gap-2">
            <input
              value={s.cp}
              onChange={(e) => setStop(i, field, j, "cp", e.target.value)}
              onBlur={async () => {
                if (s.cp.trim() && !s.lugar.trim()) {
                  const r = await lookupCp(s.cp);
                  if (r.localidad) setStop(i, field, j, "lugar", r.localidad);
                }
              }}
              placeholder="CP"
              inputMode="numeric"
              maxLength={5}
              aria-label="Código postal"
              className="w-20 flex-none text-center"
            />
            <input
              value={s.lugar}
              onChange={(e) => setStop(i, field, j, "lugar", e.target.value)}
              placeholder="Localidad"
              aria-label="Localidad"
              className="flex-1"
            />
            {stops.length > 1 && (
              <button
                type="button"
                onClick={() => removeStop(i, field, j)}
                aria-label="Quitar parada"
                className="flex-none rounded-xl border border-line px-3 font-bold text-dim"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => addStop(i, field)} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-amber">
          <Icon name="plus" size={13} /> Añadir {field === "origenes" ? "carga" : "descarga"}
        </button>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="mt-8 text-center">
        <p className="text-[15px] font-semibold">Primero necesitas un cliente</p>
        <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-dim">
          Cada porte (carga) se asigna a un cliente para poder facturarlo.
        </p>
        <Link href="/clientes/nuevo" className="mt-5 inline-flex rounded-2xl bg-amber px-5 py-3 text-sm font-extrabold text-[#1a1205]">
          Crear cliente
        </Link>
      </div>
    );
  }

  const kmHint =
    kmStatus === "calc"
      ? "Calculando ruta de camión…"
      : kmStatus === "done"
        ? "≈ km por carretera (camión) · editable"
        : kmStatus === "error"
          ? "No se pudo calcular la ruta; ponlo a mano"
          : "Los km del viaje se cuentan una sola vez";

  const rutaViaje = origen.trim() && destino.trim() ? `${origen} → ${destino}` : "la del viaje (paso 2)";
  const stepTitle = step === 1 ? "Tipo de viaje" : step === 2 ? "El viaje (trayecto)" : multi ? `Cargas (${portes.length})` : "La carga";

  return (
    <form action={formAction} className="stagger">
      {/* Los portes viajan serializados aquí */}
      <input type="hidden" name="portes" value={JSON.stringify(portes)} />

      {/* Progreso 1 · 2 · 3 */}
      <div className="mb-3 flex items-center justify-center gap-2" role="group" aria-label={`Paso ${step} de 3`}>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            aria-current={n === step ? "step" : undefined}
            className={clsx("h-2 rounded-full transition-all", n === step ? "w-7 bg-amber" : n < step ? "w-2 bg-amber" : "w-2 bg-line")}
          />
        ))}
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="mb-4 text-center text-[15px] font-bold outline-none">
        <span className="text-dim">Paso {step} de 3 · </span>
        {stepTitle}
      </h2>

      {/* ─── PASO 1 · Tipo ─── */}
      <section className={clsx(step !== 1 && "hidden")}>
        <div className="rounded-2xl border border-line bg-panel p-3.5">
          <div className="mb-2 text-[13.5px] font-bold">¿El viaje lleva una carga o varias?</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModo(false)}
              aria-pressed={!multi}
              className={clsx(
                "flex-1 rounded-[13px] border-[1.5px] px-3 py-3 text-sm font-bold transition-all",
                !multi ? "border-amber bg-amber-soft text-amber" : "border-line bg-panel text-text",
              )}
            >
              Una carga
            </button>
            <button
              type="button"
              onClick={() => setModo(true)}
              aria-pressed={multi}
              className={clsx(
                "flex-1 rounded-[13px] border-[1.5px] px-3 py-3 text-sm font-bold transition-all",
                multi ? "border-amber bg-amber-soft text-amber" : "border-line bg-panel text-text",
              )}
            >
              Varias cargas
            </button>
          </div>
          <p className="mt-2.5 text-[12px] text-dim">
            {multi
              ? "Varias cargas (multiporte): un mismo viaje del camión con cargas para varios clientes, cada una con su importe."
              : "Una sola carga para un cliente. El origen y el destino se ponen una vez."}
          </p>
        </div>
      </section>

      {/* ─── PASO 2 · Trayecto ─── */}
      <section className={clsx(step !== 2 && "hidden")}>
        <Field label="Fecha" htmlFor="fecha">
          <DateField id="fecha" name="fecha" defaultISO={defaultFecha} />
        </Field>
        <Field label="Origen" htmlFor="cp_origen" hint="CP y localidad (el CP rellena la localidad)">
          <div className="flex gap-2">
            <input
              id="cp_origen"
              name="cp_origen"
              value={origenCp}
              onChange={(e) => setOrigenCp(e.target.value)}
              onBlur={async () => {
                if (!origenCp.trim()) return;
                const r = await lookupCp(origenCp);
                if (r.localidad && !origen.trim()) setOrigen(r.localidad);
                if (r.lat != null && r.lon != null) setOrigenCoord({ lat: r.lat, lon: r.lon });
              }}
              placeholder="CP"
              inputMode="numeric"
              maxLength={5}
              aria-label="CP de origen"
              className="w-20 flex-none text-center"
            />
            <div className="flex-1">
              <PlaceAutocomplete id="origen" name="origen" value={origen} onChange={setOrigen} onResolve={setOrigenCoord} enabled={routingEnabled} placeholder="Localidad" required />
            </div>
          </div>
        </Field>
        <Field label="Destino" htmlFor="cp_destino" hint="CP y localidad (el CP rellena la localidad)">
          <div className="flex gap-2">
            <input
              id="cp_destino"
              name="cp_destino"
              value={destinoCp}
              onChange={(e) => setDestinoCp(e.target.value)}
              onBlur={async () => {
                if (!destinoCp.trim()) return;
                const r = await lookupCp(destinoCp);
                if (r.localidad && !destino.trim()) setDestino(r.localidad);
                if (r.lat != null && r.lon != null) setDestinoCoord({ lat: r.lat, lon: r.lon });
              }}
              placeholder="CP"
              inputMode="numeric"
              maxLength={5}
              aria-label="CP de destino"
              className="w-20 flex-none text-center"
            />
            <div className="flex-1">
              <PlaceAutocomplete id="destino" name="destino" value={destino} onChange={setDestino} onResolve={setDestinoCoord} enabled={routingEnabled} placeholder="Localidad" required />
            </div>
          </div>
        </Field>
        <Field label="Km del viaje" htmlFor="km" hint={kmHint}>
          <input id="km" name="km" type="number" step="1" min="0" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="940" />
        </Field>

        {vehiculos.length > 0 && (
          <Field label="Camión" htmlFor="vehiculo_id" hint="Qué camión hace este viaje">
            <select id="vehiculo_id" name="vehiculo_id" defaultValue={vehiculos.length === 1 ? vehiculos[0].id : ""}>
              <option value="">Sin asignar</option>
              {vehiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </Field>
        )}
      </section>

      {/* ─── PASO 3 · Carga(s) ─── */}
      <section className={clsx(step !== 3 && "hidden")}>
        <p className="mb-3 px-1 text-[12px] text-dim">
          {multi
            ? "Cada carga se factura a un cliente. Pon el cliente y el importe. La ruta y los km del camión ya están en el paso 2; abre “Ruta de esta carga” solo si carga o descarga en otro sitio."
            : "Pon el cliente y el importe. La ruta y los km son los del paso 2; abre “Ruta de esta carga” solo si hay varias cargas o descargas (grupaje)."}
        </p>

        {portes.map((p, i) => (
          <div key={i} className="mb-3 rounded-2xl border border-line bg-panel p-3.5">
            {multi && (
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Carga {i + 1}</span>
                {portes.length > 1 && (
                  <button type="button" onClick={() => removePorte(i)} className="text-[12.5px] font-bold text-red">
                    Quitar
                  </button>
                )}
              </div>
            )}

            <Field label="Cliente" htmlFor={`pc-${i}`}>
              <select id={`pc-${i}`} value={p.client_id} onChange={(e) => setPorte(i, { client_id: e.target.value })} required>
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
                onClick={() => setModalIdx(i)}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-line bg-amber-soft py-2.5 text-[13.5px] font-bold text-amber transition-transform active:scale-[0.98]"
              >
                <Icon name="plus" size={16} /> Nuevo cliente
              </button>
            </Field>

            <Field label="Importe (€)" htmlFor={`pi-${i}`}>
              <input
                id={`pi-${i}`}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={p.importe}
                onChange={(e) => setPorte(i, { importe: e.target.value })}
                placeholder="1240.00"
                required
                className="font-display !text-xl"
              />
            </Field>

            {/* Ruta de la carga: plegada. Si se deja vacía, hereda la del viaje. */}
            <details className="mt-1 rounded-xl border border-line bg-panel2">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-bold">
                Ruta de esta carga
                <span className="mt-0.5 block text-[11.5px] font-normal text-dim">
                  {tieneRutaPropia(p) ? "Cargas/descargas propias" : `Usa ${rutaViaje}`}
                </span>
              </summary>
              <div className="space-y-2.5 px-3 pb-3 pt-1">
                {renderStops(i, "origenes", "Cargas (orígenes)")}
                {renderStops(i, "destinos", "Descargas (destinos)")}
                <p className="px-1 text-[11px] text-dim">Si lo dejas vacío, se usa la ruta del viaje (paso 2).</p>
              </div>
            </details>

            {/* Datos opcionales: descripción y peso. */}
            <details className="mt-2 rounded-xl border border-line bg-panel2">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-bold">
                Más detalles
                <span className="mt-0.5 block text-[11.5px] font-normal text-dim">Descripción y peso (opcional)</span>
              </summary>
              <div className="px-3 pb-3 pt-1">
                <Field label="Descripción" htmlFor={`pdesc-${i}`} hint="Opcional">
                  <input id={`pdesc-${i}`} value={p.descripcion} onChange={(e) => setPorte(i, { descripcion: e.target.value })} placeholder="Fruta · carga completa" />
                </Field>
                <Field label="Carga (peso)" htmlFor={`pp-${i}`} hint="Opcional">
                  <div className="flex gap-2">
                    <input
                      id={`pp-${i}`}
                      type="number"
                      step="0.001"
                      min="0"
                      inputMode="decimal"
                      value={p.peso}
                      onChange={(e) => setPorte(i, { peso: e.target.value })}
                      placeholder="24"
                      className="flex-1"
                    />
                    <select value={p.peso_unidad} onChange={(e) => setPorte(i, { peso_unidad: e.target.value as "t" | "kg" })} className="w-24 flex-none">
                      <option value="kg">kg</option>
                      <option value="t">t</option>
                    </select>
                  </div>
                </Field>
              </div>
            </details>
          </div>
        ))}

        {multi && (
          <button
            type="button"
            onClick={addPorte}
            className="mb-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-panel py-3 text-[13.5px] font-bold text-text transition-transform active:scale-[0.98]"
          >
            <Icon name="plus" size={16} /> Añadir otra carga
          </button>
        )}
      </section>

      {stepError && <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{stepError}</p>}
      {state.error && <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{state.error}</p>}

      {/* Navegación del asistente */}
      <div className="flex gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={goBack}
            disabled={pending}
            className="flex-none rounded-[18px] border border-line bg-panel px-5 py-4 text-sm font-bold text-text transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            Atrás
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            onClick={goNext}
            className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-[18px] bg-amber py-4 text-[16px] font-extrabold text-[#1a1205] transition-transform active:scale-[0.97]"
          >
            Siguiente
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-[18px] bg-amber py-4 text-[16px] font-extrabold text-[#1a1205] transition-transform active:scale-[0.97] disabled:opacity-70"
          >
            {pending ? (
              "Guardando…"
            ) : (
              <>
                <Icon name="save" size={20} /> GUARDAR VIAJE
              </>
            )}
          </button>
        )}
      </div>

      <NewClientModal
        open={modalIdx != null}
        onClose={() => setModalIdx(null)}
        onCreated={(c) => {
          setClients((l) => [...l, c].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
          if (modalIdx != null) setPorte(modalIdx, { client_id: c.id });
          setModalIdx(null);
        }}
      />
    </form>
  );
}
