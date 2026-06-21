"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { nowMadrid } from "@/lib/format";
import { logEvent } from "@/lib/events";
import { isValidNIFOrCIF, isValidIBAN } from "@/lib/validation/fiscal";

export type AjustesState = { error?: string; ok?: boolean; message?: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ── Tus datos (identidad fiscal del emisor) ──────────────────────────────────
const datosSchema = z.object({
  nombre: z.string().trim().max(120),
  nif: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || isValidNIFOrCIF(v), "NIF/CIF no válido"),
  direccion: z.string().trim().max(200),
  cp_localidad: z.string().trim().max(120),
  iban: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === "" || isValidIBAN(v), "IBAN no válido"),
});

export async function saveDatosAction(_prev: AjustesState, formData: FormData): Promise<AjustesState> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sesión expirada. Vuelve a entrar." };
  const parsed = datosSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const d = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({
      nombre: d.nombre || null,
      nif: d.nif ? d.nif.toUpperCase() : null,
      direccion: d.direccion || null,
      cp_localidad: d.cp_localidad || null,
      iban: d.iban ? d.iban.replace(/\s+/g, "").toUpperCase() : null,
    })
    .eq("user_id", user.id);
  if (error) return { error: "No se pudieron guardar los datos." };
  revalidatePath("/ajustes/datos");
  revalidatePath("/ajustes");
  revalidatePath("/");
  return { ok: true, message: "Datos guardados." };
}

// ── Impuestos por defecto ────────────────────────────────────────────────────
const impuestosSchema = z.object({
  iva_def: z.coerce.number().min(0, "IVA fuera de rango").max(100, "IVA fuera de rango"),
  irpf_def: z.coerce.number().min(0, "IRPF fuera de rango").max(100, "IRPF fuera de rango"),
});

export async function saveImpuestosAction(_prev: AjustesState, formData: FormData): Promise<AjustesState> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sesión expirada. Vuelve a entrar." };
  const parsed = impuestosSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const { error } = await supabase
    .from("profiles")
    .update({ iva_def: parsed.data.iva_def, irpf_def: parsed.data.irpf_def })
    .eq("user_id", user.id);
  if (error) return { error: "No se pudieron guardar los impuestos." };
  revalidatePath("/ajustes/impuestos");
  revalidatePath("/ajustes");
  return { ok: true, message: "Impuestos guardados." };
}

// ── Numeración (serie + nº de arranque, con bloqueo si ya hay facturas) ───────
const numeracionSchema = z.object({
  serie: z
    .string()
    .trim()
    .min(1, "La serie es obligatoria")
    .max(10)
    .regex(/^[A-Za-z0-9/_-]+$/, "Serie no válida (letras, números, / _ -)"),
  num_inicial: z.coerce
    .number()
    .int("El número debe ser entero")
    .min(0, "Número no válido")
    .max(9_999_999, "Número fuera de rango"),
});

export async function saveNumeracionAction(_prev: AjustesState, formData: FormData): Promise<AjustesState> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sesión expirada. Vuelve a entrar." };
  const parsed = numeracionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const serie = parsed.data.serie.toUpperCase();
  const year = nowMadrid().year;

  // La SERIE se puede cambiar SIEMPRE: hacerlo simplemente empieza una serie
  // nueva (la anterior se conserva, correlativa; tener varias series es legal y
  // la cadena de huellas va por emisor, no por serie). Lo único que se protege es
  // el "suelo" de numeración: solo se fija si ESA serie+año aún no tiene facturas.
  // Si ya las tiene, fijarlo crearía un HUECO, así que se ignora y la numeración
  // sigue correlativa (max(num)+1).
  const { count: serieCount, error: countErr } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("serie", serie)
    .eq("anio", year);
  // Fail-closed: si no podemos verificar, no fijamos el suelo (pero la serie sí).
  if (countErr) return { error: "No se pudo verificar la numeración. Inténtalo de nuevo en un momento." };
  const serieTieneFacturas = (serieCount ?? 0) > 0;

  const fijarSuelo = parsed.data.num_inicial > 0 && !serieTieneFacturas;
  const numbering = fijarSuelo
    ? { serie, num_inicial: parsed.data.num_inicial, num_inicial_anio: year, num_inicial_serie: serie }
    : { serie };

  const { error } = await supabase.from("profiles").update(numbering).eq("user_id", user.id);
  if (error) return { error: "No se pudo guardar la numeración." };

  if (fijarSuelo) {
    await logEvent(supabase, "numeracion_configurada", {
      detalle: { serie, num_inicial: parsed.data.num_inicial, anio: year },
      entidad: "perfil",
    });
  }
  revalidatePath("/ajustes/numeracion");
  revalidatePath("/ajustes");
  revalidatePath("/");
  return { ok: true, message: "Numeración guardada." };
}

// ── Logo de la factura (guardado instantáneo) ────────────────────────────────
export async function saveLogoAction(logoUrl: string): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sesión expirada." };
  const url = (logoUrl ?? "").trim();
  if (url !== "" && !/^https:\/\//i.test(url)) return { error: "URL de logo no válida." };
  const { error } = await supabase.from("profiles").update({ logo_url: url || null }).eq("user_id", user.id);
  if (error) return { error: "No se pudo guardar el logo." };
  revalidatePath("/ajustes/factura");
  revalidatePath("/facturas");
  return { ok: true };
}

// ── Estilo de factura (guardado instantáneo) ─────────────────────────────────
export async function setPlantillaAction(
  plantilla: "trackapp" | "elegante" | "moderna",
): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sesión expirada." };
  const valid = (["trackapp", "elegante", "moderna"] as const).includes(plantilla) ? plantilla : "trackapp";
  const { error } = await supabase.from("profiles").update({ factura_plantilla: valid }).eq("user_id", user.id);
  if (error) return { error: "No se pudo guardar el estilo." };
  revalidatePath("/ajustes/factura");
  revalidatePath("/facturas");
  return { ok: true };
}
