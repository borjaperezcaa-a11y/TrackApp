"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { clsx } from "@/lib/clsx";
import { EXPENSE_CATEGORIES, type ExtractedExpense } from "@/lib/expense";
import { round2, parseDecimal } from "@/lib/format";
import type { ExpensePayload, ExpenseState } from "./actions";

const IVA_OPTS = [21, 10, 4, 0];

export type ExpenseValues = {
  categoria: string;
  estacion: string;
  fecha: string;
  base: string;
  iva: string;
  total: string;
  foto_path: string | null;
};

const num = parseDecimal;
function optNum(s: string): number | null {
  if (s.trim() === "") return null;
  const n = num(s);
  return Number.isFinite(n) ? n : null;
}

type Compressed = { base64: string; blob: Blob; previewUrl: string };

function compressImage(file: File): Promise<Compressed> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1280;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no ctx"));
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("no blob"));
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve({ base64: dataUrl.split(",")[1], blob, previewUrl: dataUrl });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.7,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function ExpenseForm({
  userId,
  values,
  action,
  submitLabel,
}: {
  userId: string;
  values: ExpenseValues;
  action: (payload: ExpensePayload) => Promise<ExpenseState>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [categoria, setCategoria] = useState(values.categoria || "Gasoil");
  const [estacion, setEstacion] = useState(values.estacion);
  const [fecha, setFecha] = useState(values.fecha);
  const [base, setBase] = useState(values.base);
  const [iva, setIva] = useState(values.iva);
  const [total, setTotal] = useState(values.total);
  // Tipo de IVA: si al editar ya hay base+IVA, se infiere; si no, 21 por defecto.
  const [ivaRate, setIvaRate] = useState<number>(() => {
    const b = num(values.base);
    const i = num(values.iva);
    return b > 0 && Number.isFinite(i) ? Math.round((i / b) * 100) : 21;
  });

  // Calcula base e IVA a partir del total y el tipo (desglose hacia atrás).
  function recalc(totalStr: string, rate: number) {
    const t = num(totalStr);
    if (!Number.isFinite(t) || t <= 0) return;
    const b = round2(t / (1 + rate / 100));
    setBase(String(b));
    setIva(String(round2(t - b)));
  }

  function onTotalChange(v: string) {
    setTotal(v);
    recalc(v, ivaRate);
  }
  function onIvaRate(rate: number) {
    setIvaRate(rate);
    recalc(total, rate);
  }

  const [photo, setPhoto] = useState<Compressed | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanInfo, setScanInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function applyExtraction(d: ExtractedExpense) {
    if (d.total != null) setTotal(String(d.total));
    const rate = d.iva_rate ?? ivaRate;
    if (d.iva_rate != null) setIvaRate(d.iva_rate);
    if (d.base != null || d.iva != null) {
      if (d.base != null) setBase(String(d.base));
      if (d.iva != null) setIva(String(d.iva));
    } else if (d.total != null) {
      recalc(String(d.total), rate); // sin desglose: lo calculamos del total
    }
    if (d.fecha) setFecha(d.fecha);
    if (d.establecimiento) setEstacion(d.establecimiento);
    if (d.categoria && (EXPENSE_CATEGORIES as readonly string[]).includes(d.categoria)) {
      setCategoria(d.categoria);
    }
    setScanInfo(`Leído por IA · confianza ${Math.round((d.confianza ?? 0) * 100)}%. Revisa los datos.`);
  }

  async function onScanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setScanInfo(null);
    setScanning(true);
    try {
      const c = await compressImage(file);
      setPhoto(c);
      const res = await fetch("/api/expenses/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: c.base64, mediaType: "image/jpeg" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setScanError(json.error ?? "No se pudo leer el ticket.");
      } else if (json.data) {
        applyExtraction(json.data as ExtractedExpense);
      }
    } catch {
      setScanError("Error procesando la imagen.");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    setError(null);
    const totalNum = num(total);
    if (!Number.isFinite(totalNum) || totalNum < 0) {
      setError("Indica el importe total del gasto.");
      return;
    }
    startSave(async () => {
      let fotoPath = values.foto_path;
      if (photo?.blob) {
        const supabase = createClient();
        const path = `${userId}/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("recibos")
          .upload(path, photo.blob, { contentType: "image/jpeg", upsert: true });
        if (upErr) {
          setError("No se pudo subir la foto del ticket.");
          return;
        }
        fotoPath = path;
      }
      const payload: ExpensePayload = {
        categoria,
        estacion: estacion.trim(),
        fecha,
        base: optNum(base),
        iva: optNum(iva),
        total: round2(totalNum),
        trip_id: null,
        foto_path: fotoPath,
      };
      const res = await action(payload);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const inputSm =
    "w-full rounded-xl border-[1.5px] border-line bg-panel px-3.5 py-3 text-base font-semibold text-text outline-none focus:border-amber";

  return (
    <div className="stagger pb-4">
      {/* Escaneo por foto */}
      <Card className="mb-3.5">
        <div className="flex items-center gap-3.5">
          <div className="grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-2xl border border-line bg-panel2 text-amber">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.previewUrl} alt="Ticket" className="h-full w-full object-cover" />
            ) : (
              <Icon name="image" size={26} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Escanea el ticket</div>
            <div className="mt-0.5 text-xs text-dim">La IA rellena los datos por ti.</div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={scanning}
              className="mt-2.5 inline-flex items-center gap-2 rounded-xl bg-amber px-4 py-2 text-[13px] font-extrabold text-[#1a1205] transition-transform active:scale-95 disabled:opacity-60"
            >
              <Icon name="image" size={16} />
              {scanning ? "Leyendo…" : photo ? "Otra foto" : "Hacer foto"}
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onScanFile}
          className="hidden"
        />
        {scanInfo && (
          <p className="mt-2.5 rounded-xl bg-green-soft px-3 py-2 text-xs font-semibold text-green">
            {scanInfo}
          </p>
        )}
        {scanError && (
          <p className="mt-2.5 rounded-xl bg-red-soft px-3 py-2 text-xs font-semibold text-red">
            {scanError}
          </p>
        )}
      </Card>

      {/* Categoría */}
      <Field label="Categoría">
        <div className="flex flex-wrap gap-2">
          {EXPENSE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoria(c)}
              aria-pressed={categoria === c}
              className={clsx(
                "rounded-[13px] border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-all",
                categoria === c ? "border-amber bg-amber-soft text-amber" : "border-line bg-panel text-text",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Establecimiento / estación" htmlFor="estacion">
        <input id="estacion" value={estacion} onChange={(e) => setEstacion(e.target.value)} placeholder="Repsol A-7" className={inputSm} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" htmlFor="fecha">
          <input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputSm} />
        </Field>
        <Field label="Total (€)" htmlFor="total">
          <input id="total" type="number" step="0.01" min="0" inputMode="decimal" value={total} onChange={(e) => onTotalChange(e.target.value)} placeholder="87.40" className={`${inputSm} font-display !text-xl`} />
        </Field>
      </div>

      <Field label="IVA" hint="La base y la cuota se calculan del total">
        <div className="flex flex-wrap gap-2">
          {IVA_OPTS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onIvaRate(r)}
              aria-pressed={ivaRate === r}
              className={clsx(
                "rounded-[13px] border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-all",
                ivaRate === r ? "border-amber bg-amber-soft text-amber" : "border-line bg-panel text-text",
              )}
            >
              {r}%
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Base (€)" htmlFor="base" hint="Calculada · editable">
          <input id="base" type="number" step="0.01" min="0" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} placeholder="72.23" className={inputSm} />
        </Field>
        <Field label="IVA (€)" htmlFor="iva" hint="Calculada · editable">
          <input id="iva" type="number" step="0.01" min="0" inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} placeholder="15.17" className={inputSm} />
        </Field>
      </div>

      {error && (
        <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{error}</p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex min-h-[64px] w-full items-center justify-center gap-2.5 rounded-[18px] bg-amber px-5 py-5 text-[17px] font-extrabold text-[#1a1205] shadow-[0_12px_26px_rgba(255,178,62,0.30)] transition-transform active:scale-[0.97] disabled:opacity-60"
      >
        <Icon name="save" size={22} />
        {saving ? "Guardando…" : submitLabel}
      </button>
    </div>
  );
}
