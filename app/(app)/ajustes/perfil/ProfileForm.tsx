"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { Icon } from "@/components/ui/Icon";
import { StylePreview } from "@/components/ui/StylePreview";
import { clsx } from "@/lib/clsx";
import { saveProfile, setPlantillaAction, type ProfileState } from "./actions";

/**
 * Convierte cualquier imagen (PNG/JPG/WebP) a PNG vía canvas. pdf-lib solo sabe
 * incrustar PNG/JPG, así que normalizamos a PNG para que el logo SIEMPRE salga
 * en el PDF de la factura.
 */
function imageToPng(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("no ctx"));
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no blob"))), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("no se pudo leer la imagen"));
    };
    img.src = url;
  });
}

export type ProfileValues = {
  nombre: string;
  nif: string;
  direccion: string;
  cp_localidad: string;
  iban: string;
  iva_def: number;
  irpf_def: number;
  serie: string;
  num_inicial: number;
  logo_url: string;
  factura_plantilla: Plantilla;
};

type Plantilla = "trackapp" | "elegante" | "moderna";
const PLANTILLAS: { id: Plantilla; label: string }[] = [
  { id: "trackapp", label: "TrackApp" },
  { id: "elegante", label: "Clásica" },
  { id: "moderna", label: "Moderna" },
];

const IVA_OPTS = [21, 10, 4, 0];
const initial: ProfileState = {};

export function ProfileForm({
  userId,
  values,
  nextNumero,
  locked,
}: {
  userId: string;
  values: ProfileValues;
  nextNumero: string;
  locked: boolean;
}) {
  const [state, formAction] = useActionState(saveProfile, initial);

  // Campos controlados: así no se vacían tras guardar (React 19 resetea los
  // formularios no controlados al completar una server action).
  const [nombre, setNombre] = useState(values.nombre);
  const [nif, setNif] = useState(values.nif);
  const [direccion, setDireccion] = useState(values.direccion);
  const [cpLocalidad, setCpLocalidad] = useState(values.cp_localidad);
  const [iban, setIban] = useState(values.iban);
  const [irpf, setIrpf] = useState(String(values.irpf_def));
  const [serie, setSerie] = useState(values.serie);
  const [numInicial, setNumInicial] = useState(String(values.num_inicial || ""));
  const [plantilla, setPlantilla] = useState<Plantilla>(values.factura_plantilla);
  const [savingPlantilla, startPlantilla] = useTransition();
  const [plantillaSaved, setPlantillaSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Cambia el estilo y lo GUARDA al instante (no hace falta pulsar "Guardar datos").
  function elegirPlantilla(t: Plantilla) {
    if (t === plantilla) return;
    setPlantilla(t);
    setPlantillaSaved(false);
    startPlantilla(async () => {
      const r = await setPlantillaAction(t);
      if (r.ok) setPlantillaSaved(true);
    });
  }

  const [iva, setIva] = useState<number>(values.iva_def);
  const [logoUrl, setLogoUrl] = useState<string>(values.logo_url);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setUploadError("Formato no válido. Usa PNG, JPG o WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError("El logo supera los 2 MB.");
      return;
    }
    setUploading(true);
    try {
      // Carga diferida del cliente de Supabase: solo al subir un logo.
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      // Normalizamos a PNG (pdf-lib no incrusta WebP) para que el logo salga en el PDF.
      const png = await imageToPng(file);
      const path = `${userId}/logo-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from("logos")
        .upload(path, png, { upsert: true, cacheControl: "3600", contentType: "image/png" });
      if (error) throw error;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setUploadError(`No se pudo subir el logo: ${msg}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form action={formAction} className="stagger">
      <div className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Tus datos</div>
      <Field label="Nombre o razón social" htmlFor="nombre">
        <input id="nombre" name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre o razón social" />
      </Field>

      <Field label="NIF / CIF" htmlFor="nif">
        <input id="nif" name="nif" value={nif} onChange={(e) => setNif(e.target.value)} placeholder="Tu NIF o CIF" autoCapitalize="characters" />
      </Field>

      <Field label="Dirección" htmlFor="direccion">
        <input id="direccion" name="direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número" />
      </Field>

      <Field label="CP y localidad" htmlFor="cp_localidad">
        <input id="cp_localidad" name="cp_localidad" value={cpLocalidad} onChange={(e) => setCpLocalidad(e.target.value)} placeholder="CP y localidad" />
      </Field>

      <Field label="IBAN" htmlFor="iban">
        <input id="iban" name="iban" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" autoCapitalize="characters" />
      </Field>

      <div className="mb-2 mt-5 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Factura</div>
      <Card className="mb-3.5">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-2xl border border-line bg-panel2 text-dim">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Logo"
                width={80}
                height={80}
                className="h-full w-full object-contain"
                unoptimized
              />
            ) : (
              <Icon name="image" size={26} />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold">Logo de la factura</div>
            <div className="mt-0.5 text-xs text-dim">PNG, JPG o WebP · máx. 2 MB</div>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-xl border border-line bg-panel2 px-3.5 py-2 text-[13px] font-bold text-text transition-transform active:scale-95"
              >
                {uploading ? "Subiendo…" : logoUrl ? "Cambiar" : "Subir logo"}
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl("")}
                  className="rounded-xl border border-line bg-panel2 px-3.5 py-2 text-[13px] font-bold text-red transition-transform active:scale-95"
                >
                  Quitar
                </button>
              )}
            </div>
            {uploadError && <p className="mt-1.5 text-xs font-semibold text-red">{uploadError}</p>}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onLogoChange}
          className="hidden"
        />
        <input type="hidden" name="logo_url" value={logoUrl} />

        <div className="mt-4 border-t border-line pt-3.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold">Estilo de factura</div>
            {plantillaSaved && !savingPlantilla && (
              <span className="text-[11px] font-bold text-green">Guardado ✓</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PLANTILLAS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => elegirPlantilla(p.id)}
                aria-pressed={plantilla === p.id}
                className={clsx(
                  "rounded-xl border-[1.5px] px-2 py-3 text-center transition-all active:scale-[0.97]",
                  plantilla === p.id ? "border-amber bg-amber-soft text-amber" : "border-line bg-panel2 text-text",
                )}
              >
                <span className="block text-[12.5px] font-bold">{p.label}</span>
                <span className="mt-0.5 block text-[10px] font-medium text-dim">
                  {plantilla === p.id ? (savingPlantilla ? "Guardando…" : "Activo") : ""}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="px-0.5 text-xs text-dim">El estilo se aplica al instante a tus PDFs.</p>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex flex-none items-center gap-1 text-[12.5px] font-bold text-amber"
            >
              <Icon name="doc" size={13} /> Ver ejemplos
            </button>
          </div>
        </div>
        <input type="hidden" name="factura_plantilla" value={plantilla} />
      </Card>

      <div className="mb-2 mt-5 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">Impuestos por defecto</div>
      {/* IVA por defecto (chips) */}
      <Field label="IVA por defecto">
        <div className="flex flex-wrap gap-2">
          {IVA_OPTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setIva(v)}
              aria-pressed={iva === v}
              className={clsx(
                "rounded-[13px] border-[1.5px] px-4 py-2.5 text-sm font-bold transition-all",
                iva === v
                  ? "border-amber bg-amber-soft text-amber"
                  : "border-line bg-panel text-text",
              )}
            >
              {v}%
            </button>
          ))}
        </div>
        <input type="hidden" name="iva_def" value={iva} />
      </Field>

      <Field label="IRPF por defecto (%)" htmlFor="irpf_def" hint="Transporte en módulos: 1%">
        <input
          id="irpf_def"
          name="irpf_def"
          type="number"
          step="0.5"
          min="0"
          max="100"
          inputMode="decimal"
          value={irpf}
          onChange={(e) => setIrpf(e.target.value)}
        />
      </Field>

      {/* Numeración de facturas */}
      <div className="mt-1 mb-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-dim">
        Numeración
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Serie (prefijo)" htmlFor="serie" hint="El prefijo de tus facturas. Ej.: FACT">
          <input
            id="serie"
            name="serie"
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
            autoCapitalize="characters"
            readOnly={locked}
            className={locked ? "opacity-60" : undefined}
          />
        </Field>
        <Field
          label="Nº última factura"
          htmlFor="num_inicial"
          hint="Si ya facturabas, escríbelo aquí"
        >
          <input
            id="num_inicial"
            name="num_inicial"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={numInicial}
            onChange={(e) => setNumInicial(e.target.value)}
            placeholder="0"
            readOnly={locked}
            className={locked ? "opacity-60" : undefined}
          />
        </Field>
      </div>

      <div className="mb-3.5 rounded-2xl border border-amber-line bg-amber-soft px-4 py-3 text-[12.5px] leading-relaxed text-amber">
        <b>Próxima factura: {nextNumero}</b>
        <br />
        {locked ? (
          <span>
            Ya has emitido facturas con la app, así que la serie y el número de arranque quedan
            bloqueados: cambiarlos rompería la numeración correlativa (Verifactu lo exige).
          </span>
        ) : (
          <span>
            Si vienes de facturar por tu cuenta, elige tu <b>prefijo</b> y escribe el{" "}
            <b>número de tu última factura</b> de este año (p. ej. 42): la app continuará tu serie
            y emitirá la 43. Si empiezas de cero, déjalo en 0. Solo se puede ajustar{" "}
            <b>antes de emitir la primera factura</b> en la app.
          </span>
        )}
      </div>

      {state.error && (
        <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="mb-3 rounded-xl bg-green-soft px-3 py-2 text-sm font-semibold text-green">
          {state.message}
        </p>
      )}

      <Cta icon="save">GUARDAR DATOS</Cta>

      <StylePreview open={previewOpen} onClose={() => setPreviewOpen(false)} current={plantilla} />
    </form>
  );
}
