"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { StylePreview } from "@/components/ui/StylePreview";
import { clsx } from "@/lib/clsx";
import { saveLogoAction, setPlantillaAction } from "../actions";

type Plantilla = "trackapp" | "elegante" | "moderna";
const PLANTILLAS: { id: Plantilla; label: string }[] = [
  { id: "trackapp", label: "TrackApp" },
  { id: "elegante", label: "Clásica" },
  { id: "moderna", label: "Moderna" },
];

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

export function FacturaForm({
  userId,
  values,
}: {
  userId: string;
  values: { logo_url: string; factura_plantilla: Plantilla };
}) {
  const [logoUrl, setLogoUrl] = useState(values.logo_url);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [plantilla, setPlantilla] = useState<Plantilla>(values.factura_plantilla);
  const [savingPlantilla, startPlantilla] = useTransition();
  const [plantillaSaved, setPlantillaSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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
      await saveLogoAction(data.publicUrl); // persistir al instante
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

  function elegirPlantilla(t: Plantilla) {
    if (t === plantilla) return;
    setPlantilla(t);
    setPlantillaSaved(false);
    startPlantilla(async () => {
      const r = await setPlantillaAction(t);
      if (r.ok) setPlantillaSaved(true);
    });
  }

  return (
    <div className="stagger">
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
            <div className="mt-0.5 text-xs text-dim">PNG, JPG o WebP · máx. 2 MB</div>
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
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onLogoChange}
          className="hidden"
        />
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-bold">Estilo de factura</div>
          <span role="status" className="text-[11px] font-bold text-green">
            {plantillaSaved && !savingPlantilla ? "Guardado ✓" : ""}
          </span>
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
      </Card>

      <StylePreview open={previewOpen} onClose={() => setPreviewOpen(false)} current={plantilla} />
    </div>
  );
}
