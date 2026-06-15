"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { clsx } from "@/lib/clsx";
import { round2, eur, parseDecimal } from "@/lib/format";
import { serieFromNumero, type ExtractedInvoice } from "@/lib/external-invoice";
import type { ExternalInvoicePayload, ExternalInvoiceState } from "./actions";

const IVA_OPTS = [21, 10, 4, 0];
const IRPF_OPTS = [0, 1, 7, 15];

export type ExternalInvoiceValues = {
  serie: string;
  numero: string;
  fecha: string;
  cliente: string;
  cliente_nif: string;
  concepto: string;
  base: string;
  iva_rate: string;
  iva: string;
  irpf_rate: string;
  irpf: string;
  cobrada: boolean;
  archivo_path: string | null;
};

const num = parseDecimal;
function optNum(s: string): number | null {
  if (s.trim() === "") return null;
  const n = num(s);
  return Number.isFinite(n) ? n : null;
}

type Picked = { previewUrl: string | null; isPdf: boolean; name: string };

function compressImage(file: File): Promise<{ base64: string; blob: Blob; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1600;
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
        0.72,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function ExternalInvoiceForm({
  userId,
  values,
  action,
  submitLabel,
  knownSeries = {},
  scanEnabled = true,
}: {
  userId: string;
  values: ExternalInvoiceValues;
  action: (payload: ExternalInvoicePayload) => Promise<ExternalInvoiceState>;
  submitLabel: string;
  knownSeries?: Record<string, string>;
  scanEnabled?: boolean;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [serie, setSerie] = useState(values.serie);
  // Mientras el usuario no toque la serie a mano, se autorrellena del número.
  const [serieAuto, setSerieAuto] = useState(values.serie.trim() === "");
  const [numero, setNumero] = useState(values.numero);

  // Detecta la serie del número y, si ya tiene nombre conocido, lo reutiliza.
  function detectSerie(numeroVal: string) {
    if (!serieAuto) return;
    const pref = serieFromNumero(numeroVal);
    setSerie(pref ? knownSeries[pref] ?? pref : "");
  }
  function onNumero(v: string) {
    setNumero(v);
    detectSerie(v);
  }
  function onSerie(v: string) {
    setSerie(v);
    setSerieAuto(false); // el usuario toma el control del nombre de serie
  }
  const [fecha, setFecha] = useState(values.fecha);
  const [cliente, setCliente] = useState(values.cliente);
  const [clienteNif, setClienteNif] = useState(values.cliente_nif);
  const [concepto, setConcepto] = useState(values.concepto);
  const [base, setBase] = useState(values.base);
  const [iva, setIva] = useState(values.iva);
  const [irpf, setIrpf] = useState(values.irpf);
  const [cobrada, setCobrada] = useState(values.cobrada);

  const [ivaRate, setIvaRate] = useState<number>(() => {
    const r = num(values.iva_rate);
    return Number.isFinite(r) && values.iva_rate.trim() !== "" ? r : 21;
  });
  const [irpfRate, setIrpfRate] = useState<number>(() => {
    const r = num(values.irpf_rate);
    return Number.isFinite(r) && values.irpf_rate.trim() !== "" ? r : 0;
  });

  // total = base + IVA − IRPF (lo recalculamos siempre a partir de las cuotas).
  const totalNum = round2((num(base) || 0) + (num(iva) || 0) - (num(irpf) || 0));

  function onBase(v: string) {
    setBase(v);
    const b = num(v);
    if (Number.isFinite(b)) {
      setIva(String(round2((b * ivaRate) / 100)));
      setIrpf(String(round2((b * irpfRate) / 100)));
    }
  }
  function onIvaRate(r: number) {
    setIvaRate(r);
    const b = num(base);
    if (Number.isFinite(b)) setIva(String(round2((b * r) / 100)));
  }
  function onIrpfRate(r: number) {
    setIrpfRate(r);
    const b = num(base);
    if (Number.isFinite(b)) setIrpf(String(round2((b * r) / 100)));
  }

  const [file, setFile] = useState<{ blob: Blob; ext: string; contentType: string } | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanInfo, setScanInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function applyExtraction(d: ExtractedInvoice) {
    if (d.numero) {
      setNumero(d.numero);
      detectSerie(d.numero);
    }
    if (d.fecha) setFecha(d.fecha);
    if (d.cliente) setCliente(d.cliente);
    if (d.cliente_nif) setClienteNif(d.cliente_nif);
    if (d.concepto) setConcepto(d.concepto);
    if (d.iva_rate != null) setIvaRate(d.iva_rate);
    if (d.irpf_rate != null) setIrpfRate(d.irpf_rate);
    if (d.base != null) setBase(String(d.base));
    // Cuotas: si vienen, se usan; si no, se calculan de base × tipo.
    const b = d.base ?? num(base);
    const ivr = d.iva_rate ?? ivaRate;
    const irr = d.irpf_rate ?? irpfRate;
    setIva(String(d.iva != null ? d.iva : round2(((b || 0) * ivr) / 100)));
    setIrpf(String(d.irpf != null ? d.irpf : round2(((b || 0) * irr) / 100)));
    setScanInfo(`Leído por IA · confianza ${Math.round((d.confianza ?? 0) * 100)}%. Revisa los datos.`);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setScanError(null);
    setScanInfo(null);

    const isPdf = f.type === "application/pdf";
    if (isPdf) {
      // PDF: se archiva tal cual; la IA solo lee imágenes, así que datos a mano.
      setFile({ blob: f, ext: "pdf", contentType: "application/pdf" });
      setPicked({ previewUrl: null, isPdf: true, name: f.name });
      setScanInfo("PDF adjuntado. Rellena los datos a mano.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setScanning(true);
    try {
      const c = await compressImage(f);
      setFile({ blob: c.blob, ext: "jpg", contentType: "image/jpeg" });
      setPicked({ previewUrl: c.previewUrl, isPdf: false, name: f.name });
      const res = await fetch("/api/invoices/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: c.base64, mediaType: "image/jpeg" }),
      });
      const json = await res.json();
      if (!res.ok) setScanError(json.error ?? "No se pudo leer la factura.");
      else if (json.data) applyExtraction(json.data as ExtractedInvoice);
    } catch {
      setScanError("Error procesando el archivo.");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    setError(null);
    if (numero.trim() === "") {
      setError("Indica el número de la factura.");
      return;
    }
    if (serie.trim() === "") {
      setError("Indica la serie (nombre) de la factura.");
      return;
    }
    const baseNum = num(base);
    if (!Number.isFinite(baseNum) || baseNum <= 0) {
      setError("Indica la base imponible de la factura.");
      return;
    }
    if (totalNum < 0) {
      setError("El total es negativo: la retención de IRPF no puede superar a base + IVA.");
      return;
    }
    startSave(async () => {
      let archivoPath = values.archivo_path;
      if (file?.blob) {
        const supabase = createClient();
        const path = `${userId}/${Date.now()}.${file.ext}`;
        const { error: upErr } = await supabase.storage
          .from("facturas")
          .upload(path, file.blob, { contentType: file.contentType, upsert: true });
        if (upErr) {
          setError("No se pudo subir el archivo de la factura.");
          return;
        }
        archivoPath = path;
      }
      const payload: ExternalInvoicePayload = {
        serie: serie.trim(),
        numero: numero.trim(),
        fecha,
        cliente: cliente.trim() || null,
        cliente_nif: clienteNif.trim() || null,
        concepto: concepto.trim() || null,
        base: num(base) || 0,
        iva_rate: optNum(String(ivaRate)),
        iva: num(iva) || 0,
        irpf_rate: optNum(String(irpfRate)),
        irpf: num(irpf) || 0,
        total: totalNum,
        cobrada,
        archivo_path: archivoPath,
        notas: null,
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
      {/* Escaneo por foto / adjuntar PDF (solo si la IA está configurada) */}
      {scanEnabled && (
      <Card className="mb-3.5">
        <div className="flex items-center gap-3.5">
          <div className="grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-2xl border border-line bg-panel2 text-amber">
            {picked?.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={picked.previewUrl} alt="Factura" className="h-full w-full object-cover" />
            ) : picked?.isPdf ? (
              <Icon name="doc" size={26} />
            ) : (
              <Icon name="image" size={26} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Escanea la factura</div>
            <div className="mt-0.5 text-xs text-dim">Foto y la IA rellena los datos. PDF también vale.</div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={scanning}
              className="mt-2.5 inline-flex items-center gap-2 rounded-xl bg-amber px-4 py-2 text-[13px] font-extrabold text-[#1a1205] transition-transform active:scale-95 disabled:opacity-60"
            >
              <Icon name="image" size={16} />
              {scanning ? "Leyendo…" : picked ? "Otro archivo" : "Foto o PDF"}
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={onPickFile}
          className="hidden"
        />
        {scanInfo && (
          <p className="mt-2.5 rounded-xl bg-green-soft px-3 py-2 text-xs font-semibold text-green">{scanInfo}</p>
        )}
        {scanError && (
          <p className="mt-2.5 rounded-xl bg-red-soft px-3 py-2 text-xs font-semibold text-red">{scanError}</p>
        )}
      </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nº factura" htmlFor="numero">
          <input id="numero" value={numero} onChange={(e) => onNumero(e.target.value)} placeholder="COOP/25-1234" className={inputSm} />
        </Field>
        <Field label="Fecha" htmlFor="fecha">
          <input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputSm} />
        </Field>
      </div>

      <Field label="Serie" htmlFor="serie" hint="Nombre para saber de quién es. Se detecta del número; puedes cambiarlo.">
        <input id="serie" value={serie} onChange={(e) => onSerie(e.target.value)} placeholder="Cooperativa Levante" className={inputSm} />
      </Field>

      <Field label="Cliente final" htmlFor="cliente" hint="El destinatario de la factura (no la cooperativa)">
        <input id="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Transportes Ejemplo S.L." className={inputSm} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="NIF cliente" htmlFor="cliente_nif">
          <input id="cliente_nif" value={clienteNif} onChange={(e) => setClienteNif(e.target.value)} placeholder="B12345678" className={inputSm} />
        </Field>
        <Field label="Concepto" htmlFor="concepto">
          <input id="concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Portes mayo" className={inputSm} />
        </Field>
      </div>

      <Field label="Base imponible (€)" htmlFor="base">
        <input id="base" type="number" step="0.01" min="0" inputMode="decimal" value={base} onChange={(e) => onBase(e.target.value)} placeholder="1500.00" className={`${inputSm} font-display !text-xl`} />
      </Field>

      <Field label="IVA" hint="La cuota se calcula de la base · editable">
        <div className="flex flex-wrap gap-2">
          {IVA_OPTS.map((r) => (
            <button key={r} type="button" onClick={() => onIvaRate(r)} aria-pressed={ivaRate === r} className={chip(ivaRate === r)}>
              {r}%
            </button>
          ))}
        </div>
      </Field>

      <Field label="Retención IRPF" hint="Transporte: 15% (o 7% nuevos autónomos). 0 si no aplica.">
        <div className="flex flex-wrap gap-2">
          {IRPF_OPTS.map((r) => (
            <button key={r} type="button" onClick={() => onIrpfRate(r)} aria-pressed={irpfRate === r} className={chip(irpfRate === r)}>
              {r}%
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Cuota IVA (€)" htmlFor="iva" hint="Calculada · editable">
          <input id="iva" type="number" step="0.01" min="0" inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} placeholder="315.00" className={inputSm} />
        </Field>
        <Field label="IRPF (€)" htmlFor="irpf" hint="Calculada · editable">
          <input id="irpf" type="number" step="0.01" min="0" inputMode="decimal" value={irpf} onChange={(e) => setIrpf(e.target.value)} placeholder="0.00" className={inputSm} />
        </Field>
      </div>

      {/* Total calculado */}
      <div className="mb-3.5 flex items-center justify-between rounded-2xl border border-line bg-panel2 px-4 py-3.5">
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-dim">Total factura</span>
        <span className="font-display text-2xl font-bold text-amber tnum">{eur(totalNum)}</span>
      </div>

      {/* Estado de cobro */}
      <Field label="Estado">
        <div className="flex gap-2">
          <button type="button" onClick={() => setCobrada(false)} aria-pressed={!cobrada} className={chip(!cobrada)}>Pendiente</button>
          <button type="button" onClick={() => setCobrada(true)} aria-pressed={cobrada} className={chip(cobrada)}>Cobrada</button>
        </div>
      </Field>

      {error && <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">{error}</p>}

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

function chip(active: boolean): string {
  return clsx(
    "rounded-[13px] border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-all",
    active ? "border-amber bg-amber-soft text-amber" : "border-line bg-panel text-text",
  );
}
