"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { Icon } from "@/components/ui/Icon";
import { clsx } from "@/lib/clsx";
import { saveProfile, type ProfileState } from "./actions";

export type ProfileValues = {
  nombre: string;
  nif: string;
  direccion: string;
  cp_localidad: string;
  iban: string;
  iva_def: number;
  irpf_def: number;
  serie: string;
  logo_url: string;
};

const IVA_OPTS = [21, 10, 4, 0];
const initial: ProfileState = {};

export function ProfileForm({
  userId,
  values,
  nextNumero,
}: {
  userId: string;
  values: ProfileValues;
  nextNumero: string;
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

  const [iva, setIva] = useState<number>(values.iva_def);
  const [logoUrl, setLogoUrl] = useState<string>(values.logo_url);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${userId}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("logos")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (error) throw error;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
    } catch {
      setUploadError("No se pudo subir el logo. Revisa que el bucket existe.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form action={formAction} className="stagger">
      {/* Logo */}
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
            <div className="mt-0.5 text-xs text-dim">PNG, JPG o SVG · máx. 2 MB</div>
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
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={onLogoChange}
          className="hidden"
        />
        <input type="hidden" name="logo_url" value={logoUrl} />
      </Card>

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

      {/* IVA por defecto (chips) */}
      <Field label="IVA por defecto">
        <div className="flex flex-wrap gap-2">
          {IVA_OPTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setIva(v)}
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

      <div className="grid grid-cols-2 gap-3">
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
        <Field label="Serie" htmlFor="serie" hint={`Próximo nº: ${nextNumero}`}>
          <input id="serie" name="serie" value={serie} onChange={(e) => setSerie(e.target.value)} autoCapitalize="characters" />
        </Field>
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
    </form>
  );
}
