"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Field } from "@/components/ui/Field";
import { Cta } from "@/components/ui/Cta";
import { saveDatosAction, saveLogoAction, type AjustesState } from "../actions";

export type DatosValues = {
  nombre: string;
  nif: string;
  direccion: string;
  cp_localidad: string;
  iban: string;
  logo_url: string;
};

/** Normaliza cualquier imagen a PNG (pdf-lib no incrusta WebP). */
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

const initial: AjustesState = {};

export function DatosForm({ userId, values }: { userId: string; values: DatosValues }) {
  const [state, action] = useActionState(saveDatosAction, initial);
  const [nombre, setNombre] = useState(values.nombre);
  const [nif, setNif] = useState(values.nif);
  const [direccion, setDireccion] = useState(values.direccion);
  const [cpLocalidad, setCpLocalidad] = useState(values.cp_localidad);
  const [iban, setIban] = useState(values.iban);

  // Logo (se guarda al instante, igual que antes en "Factura").
  const [logoUrl, setLogoUrl] = useState(values.logo_url);
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
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const png = await imageToPng(file);
      const path = `${userId}/logo-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from("logos")
        .upload(path, png, { upsert: true, cacheControl: "3600", contentType: "image/png" });
      if (error) throw error;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      await saveLogoAction(data.publicUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setUploadError(`No se pudo subir el logo: ${msg}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeLogo() {
    setLogoUrl("");
    void saveLogoAction("");
  }

  return (
    <form action={action} className="stagger">
      <Card className="mb-3.5">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-2xl border border-line bg-panel2 text-dim">
            {logoUrl ? (
              <Image src={logoUrl} alt="Logo actual" width={80} height={80} className="h-full w-full object-contain" unoptimized />
            ) : (
              <Icon name="image" size={26} />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold">Logo de la factura</div>
            <div className="mt-0.5 text-xs text-dim">PNG, JPG o WebP · máx. 2 MB · se guarda al instante</div>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-xl border border-line bg-panel2 px-3.5 py-2 text-[13px] font-bold text-text transition-transform active:scale-95 disabled:opacity-60"
              >
                {uploading ? "Subiendo…" : logoUrl ? "Cambiar" : "Subir logo"}
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={uploading}
                  className="rounded-xl border border-line bg-panel2 px-3.5 py-2 text-[13px] font-bold text-red transition-transform active:scale-95 disabled:opacity-60"
                >
                  Quitar
                </button>
              )}
            </div>
            {uploadError && (
              <p role="alert" className="mt-1.5 text-xs font-semibold text-red">
                {uploadError}
              </p>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogoChange} className="hidden" />
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

      {state.error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mb-3 rounded-xl bg-green-soft px-3 py-2 text-sm font-semibold text-green">
          {state.message ?? "Guardado ✓"}
        </p>
      )}

      <Cta icon="save">GUARDAR DATOS</Cta>
    </form>
  );
}
