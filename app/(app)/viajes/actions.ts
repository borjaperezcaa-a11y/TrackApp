"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseDecimal } from "@/lib/format";

export type TripState = { error?: string };

const num = parseDecimal;

// ─── VIAJE FÍSICO (trayecto + km) ─────────────────────────────────────────────
const viajeSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  origen: z.string().trim().max(160),
  destino: z.string().trim().max(160),
  km: z.string().trim(),
});

function parseViaje(formData: FormData):
  | { ok: true; row: { fecha: string; origen: string | null; destino: string | null; km: number | null } }
  | { ok: false; error: string } {
  const parsed = viajeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const d = parsed.data;
  let km: number | null = null;
  if (d.km !== "") {
    const k = num(d.km);
    if (!Number.isFinite(k) || k < 0) return { ok: false, error: "Km no válidos" };
    km = k;
  }
  return { ok: true, row: { fecha: d.fecha, origen: d.origen || null, destino: d.destino || null, km } };
}

// ─── PORTE (carga de un cliente: lo que se factura) ───────────────────────────
const porteSchema = z.object({
  client_id: z.string().uuid("Selecciona un cliente"),
  origen: z.string().trim().max(160),
  destino: z.string().trim().max(160),
  descripcion: z.string().trim().max(300),
  peso: z.string().trim(),
  peso_unidad: z.enum(["t", "kg"]).default("kg"),
  importe: z.string().trim(),
});

function parsePorte(formData: FormData):
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string } {
  const parsed = porteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const d = parsed.data;

  const importe = num(d.importe);
  if (!Number.isFinite(importe) || importe <= 0) return { ok: false, error: "El importe debe ser mayor que 0" };

  let peso: number | null = null;
  if (d.peso !== "") {
    const p = num(d.peso);
    if (!Number.isFinite(p) || p < 0) return { ok: false, error: "Peso no válido" };
    peso = p;
  }

  return {
    ok: true,
    row: {
      client_id: d.client_id,
      origen: d.origen || null,
      destino: d.destino || null,
      descripcion: d.descripcion || null,
      peso,
      peso_unidad: d.peso_unidad,
      importe,
    },
  };
}

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ─── Crear viaje (trayecto + uno o varios portes) ─────────────────────────────
// Los portes llegan serializados en el campo `portes` (JSON) del formulario.
export async function createViajeAction(_prev: TripState, formData: FormData): Promise<TripState> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sesión expirada." };

  const v = parseViaje(formData);
  if (!v.ok) return { error: v.error };

  let drafts: unknown;
  try {
    drafts = JSON.parse(String(formData.get("portes") ?? "[]"));
  } catch {
    return { error: "Portes no válidos." };
  }
  if (!Array.isArray(drafts) || drafts.length === 0) return { error: "Añade al menos un porte." };

  const uuid = z.string().uuid();
  const rows: Record<string, unknown>[] = [];
  for (const d of drafts as Record<string, unknown>[]) {
    const client_id = typeof d?.client_id === "string" ? d.client_id : "";
    if (!uuid.safeParse(client_id).success) return { error: "Cada porte necesita un cliente." };
    const importe = num(String(d?.importe ?? ""));
    if (!Number.isFinite(importe) || importe <= 0) return { error: "Cada porte necesita un importe mayor que 0." };
    // Si el porte no trae ruta propia, hereda la del trayecto.
    const origen = String(d?.origen ?? "").trim() || v.row.origen;
    const destino = String(d?.destino ?? "").trim() || v.row.destino;
    const descripcion = String(d?.descripcion ?? "").trim() || null;
    // Carga (peso) del porte, opcional. Unidad por defecto kg.
    const pesoStr = String(d?.peso ?? "").trim();
    let peso: number | null = null;
    if (pesoStr !== "") {
      const pn = num(pesoStr);
      if (!Number.isFinite(pn) || pn < 0) return { error: "Peso de un porte no válido." };
      peso = pn;
    }
    const peso_unidad = d?.peso_unidad === "t" ? "t" : "kg";
    rows.push({ client_id, origen, destino, descripcion, peso, peso_unidad, importe });
  }

  // 1) Viaje físico
  const { data: viaje, error: vErr } = await supabase
    .from("viajes")
    .insert({ ...v.row, user_id: user.id })
    .select("id")
    .single();
  if (vErr || !viaje) return { error: "No se pudo crear el viaje." };

  // 2) Portes del viaje
  const { error: pErr } = await supabase
    .from("trips")
    .insert(rows.map((r) => ({ ...r, fecha: v.row.fecha, viaje_id: viaje.id, user_id: user.id, estado: "pendiente" })));
  if (pErr) {
    // Si fallan los portes, no dejamos un viaje vacío huérfano.
    await supabase.from("viajes").delete().eq("id", viaje.id).eq("user_id", user.id);
    return { error: "No se pudieron crear los portes del viaje." };
  }

  revalidatePath("/viajes");
  redirect(`/viajes/${viaje.id}`);
}

// ─── Editar trayecto del viaje ────────────────────────────────────────────────
export async function updateViajeAction(id: string, _prev: TripState, formData: FormData): Promise<TripState> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sesión expirada." };

  const v = parseViaje(formData);
  if (!v.ok) return { error: v.error };

  const { error } = await supabase.from("viajes").update(v.row).eq("id", id).eq("user_id", user.id);
  if (error) return { error: "No se pudieron guardar los cambios del viaje." };

  revalidatePath("/viajes");
  revalidatePath(`/viajes/${id}`);
  redirect(`/viajes/${id}`);
}

// ─── Borrar viaje (solo si ningún porte está facturado) ───────────────────────
export async function deleteViajeAction(id: string, _prev: TripState, _formData: FormData): Promise<TripState> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sesión expirada." };

  const { data: portes, error: pErr } = await supabase
    .from("trips")
    .select("estado")
    .eq("viaje_id", id)
    .eq("user_id", user.id);
  if (pErr) return { error: "No se pudo comprobar el viaje. Inténtalo de nuevo." };
  if ((portes ?? []).some((p) => p.estado === "facturado")) {
    return { error: "Este viaje tiene portes facturados; no se puede borrar." };
  }

  // Borra los portes (pendientes) y luego el viaje.
  const { error: delPortes } = await supabase.from("trips").delete().eq("viaje_id", id).eq("user_id", user.id);
  if (delPortes) return { error: "No se pudo borrar el viaje." };
  const { error } = await supabase.from("viajes").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar el viaje." };

  revalidatePath("/viajes");
  redirect("/viajes");
}

// ─── Añadir un porte a un viaje existente ──────────────────────────────────────
export async function addPorteAction(viajeId: string, _prev: TripState, formData: FormData): Promise<TripState> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sesión expirada." };

  // El viaje debe ser del usuario (defensa en profundidad sobre la RLS).
  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, fecha, origen, destino")
    .eq("id", viajeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viaje) return { error: "Viaje no encontrado." };

  const p = parsePorte(formData);
  if (!p.ok) return { error: p.error };

  // Si el porte no trae ruta propia, hereda la del viaje.
  const porteRow = p.row as { origen: string | null; destino: string | null } & Record<string, unknown>;
  if (!porteRow.origen) porteRow.origen = viaje.origen;
  if (!porteRow.destino) porteRow.destino = viaje.destino;

  const { error } = await supabase
    .from("trips")
    .insert({ ...porteRow, fecha: viaje.fecha, viaje_id: viajeId, user_id: user.id, estado: "pendiente" });
  if (error) return { error: "No se pudo añadir el porte." };

  revalidatePath("/viajes");
  revalidatePath(`/viajes/${viajeId}`);
  redirect(`/viajes/${viajeId}`);
}

// ─── Editar un porte (si no está facturado) ───────────────────────────────────
export async function updatePorteAction(porteId: string, _prev: TripState, formData: FormData): Promise<TripState> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sesión expirada." };

  const { data: existing } = await supabase
    .from("trips")
    .select("estado, viaje_id")
    .eq("id", porteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return { error: "Porte no encontrado." };
  if (existing.estado === "facturado") return { error: "Este porte ya está facturado y no se puede editar." };

  const p = parsePorte(formData);
  if (!p.ok) return { error: p.error };

  const { error } = await supabase.from("trips").update(p.row).eq("id", porteId).eq("user_id", user.id);
  if (error) return { error: "No se pudieron guardar los cambios del porte." };

  revalidatePath("/viajes");
  if (existing.viaje_id) revalidatePath(`/viajes/${existing.viaje_id}`);
  redirect(existing.viaje_id ? `/viajes/${existing.viaje_id}` : "/viajes");
}

// ─── Borrar un porte (si no está facturado) ───────────────────────────────────
export async function deletePorteAction(porteId: string, _prev: TripState, _formData: FormData): Promise<TripState> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sesión expirada." };

  const { data: existing } = await supabase
    .from("trips")
    .select("estado, viaje_id")
    .eq("id", porteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return { error: "Porte no encontrado." };
  if (existing.estado === "facturado") return { error: "No puedes borrar un porte ya facturado." };

  const { error } = await supabase.from("trips").delete().eq("id", porteId).eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar el porte." };

  revalidatePath("/viajes");
  if (existing.viaje_id) revalidatePath(`/viajes/${existing.viaje_id}`);
  redirect(existing.viaje_id ? `/viajes/${existing.viaje_id}` : "/viajes");
}
