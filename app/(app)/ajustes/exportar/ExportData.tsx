"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { SISTEMA } from "@/lib/declaracion";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Snapshot = { nombre?: string; nif?: string } | null;
type Invoice = {
  numero: string;
  fecha: string;
  cliente_snapshot: Snapshot;
  base: number;
  iva_rate: number;
  iva: number;
  irpf_rate: number;
  irpf: number;
  total: number;
  pagada: boolean;
  tipo: string;
  huella: string;
};

async function fetchAll() {
  const supabase = createClient();
  const [inv, lines, ev, ext] = await Promise.all([
    supabase.from("invoices").select("*").order("chain_index", { ascending: true }),
    supabase.from("invoice_lines").select("*"),
    supabase.from("system_events").select("*").order("chain_index", { ascending: true }),
    supabase.from("external_invoices").select("*").order("numero", { ascending: true }),
  ]);
  const err = inv.error || lines.error || ev.error || ext.error;
  if (err) throw err;
  return {
    invoices: (inv.data ?? []) as Invoice[],
    lines: lines.data ?? [],
    events: ev.data ?? [],
    external: ext.data ?? [],
  };
}

// es-ES para Excel: separador ';' y decimales con coma, sin separador de millares.
function dec(n: number | null | undefined): string {
  if (n == null) return "";
  return String(n).replace(".", ",");
}
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function ExportData() {
  const [busy, setBusy] = useState<null | "json" | "csv">(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function stamp() {
    // Fecha local en zona España para el nombre del archivo.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  }

  async function exportJson() {
    setError(null);
    setInfo(null);
    setBusy("json");
    try {
      const data = await fetchAll();
      const cuerpo = {
        sistema: SISTEMA.nombre,
        version: SISTEMA.version,
        exportado_en: new Date().toISOString(),
        facturas: data.invoices,
        lineas_factura: data.lines,
        registro_eventos: data.events,
        facturas_externas: data.external,
      };
      const json = JSON.stringify(cuerpo, null, 2);
      // "Archivo seguro": huella del volcado para detectar manipulaciones.
      const huella = await sha256Hex(json);
      const finalDoc = JSON.stringify({ ...cuerpo, huella_integridad_sha256: huella }, null, 2);
      download(`trackapp-registros-${stamp()}.json`, finalDoc, "application/json");
      setInfo(
        `Copia generada: ${data.invoices.length} facturas, ${data.events.length} eventos, ` +
          `${data.external.length} externas. Huella SHA-256: ${huella.slice(0, 16)}…`,
      );
    } catch {
      setError("No se pudo generar la copia. Inténtalo de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    setError(null);
    setInfo(null);
    setBusy("csv");
    try {
      const { invoices } = await fetchAll();
      const headers = [
        "numero",
        "fecha",
        "cliente",
        "nif_cliente",
        "base",
        "iva_%",
        "iva",
        "irpf_%",
        "irpf",
        "total",
        "cobrada",
        "tipo",
        "huella",
      ];
      const lines = invoices.map((i) =>
        [
          i.numero,
          i.fecha,
          i.cliente_snapshot?.nombre ?? "",
          i.cliente_snapshot?.nif ?? "",
          dec(i.base),
          dec(i.iva_rate),
          dec(i.iva),
          dec(i.irpf_rate),
          dec(i.irpf),
          dec(i.total),
          i.pagada ? "Sí" : "No",
          i.tipo,
          i.huella,
        ]
          .map(csvCell)
          .join(";"),
      );
      // BOM para que Excel detecte UTF-8.
      const csv = "﻿" + [headers.map(csvCell).join(";"), ...lines].join("\r\n");
      download(`trackapp-facturas-${stamp()}.csv`, csv, "text/csv");
      setInfo(`CSV generado con ${invoices.length} facturas.`);
    } catch {
      setError("No se pudo generar el CSV. Inténtalo de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stagger">
      <Card className="mb-3.5">
        <div className="text-sm font-bold">Copia de seguridad completa (JSON)</div>
        <p className="mt-1 text-[12.5px] text-dim">
          Volcado íntegro de tus registros: facturas con su huella encadenada, líneas, registro de
          eventos y facturas externas. Incluye una huella SHA-256 del propio archivo para verificar
          que no se ha manipulado. Guárdalo en lugar seguro.
        </p>
        <button
          type="button"
          onClick={exportJson}
          disabled={busy !== null}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber px-4 py-2.5 text-[13px] font-extrabold text-[#1a1205] transition-transform active:scale-95 disabled:opacity-60"
        >
          <Icon name="save" size={16} />
          {busy === "json" ? "Generando…" : "Descargar copia (JSON)"}
        </button>
      </Card>

      <Card className="mb-3.5">
        <div className="text-sm font-bold">Facturas para tu asesoría (CSV)</div>
        <p className="mt-1 text-[12.5px] text-dim">
          Listado de facturas en formato de hoja de cálculo (Excel/LibreOffice), con base, IVA, IRPF
          y total. Cómodo para enviárselo a tu gestor.
        </p>
        <button
          type="button"
          onClick={exportCsv}
          disabled={busy !== null}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-line bg-panel2 px-4 py-2.5 text-[13px] font-bold text-text transition-transform active:scale-95 disabled:opacity-60"
        >
          <Icon name="doc" size={16} />
          {busy === "csv" ? "Generando…" : "Descargar facturas (CSV)"}
        </button>
      </Card>

      {info && (
        <p className="mb-3 rounded-xl bg-green-soft px-3 py-2 text-xs font-semibold text-green">{info}</p>
      )}
      {error && (
        <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-xs font-semibold text-red">{error}</p>
      )}
    </div>
  );
}
