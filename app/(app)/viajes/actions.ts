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
  cp_origen: z.string().trim().max(12).optional(),
  cp_destino: z.string().trim().max(12).optional(),
  km: z.string().trim(),
  vehiculo_id: z.string().trim().optional(),
});

/** Combina código postal + localidad, el CP delante: "15890 Santiago de Compostela". */
function conCp(lugar?: string, cp?: string): string | null {
  const l = (lugar ?? "").trim();
  const c = (cp ?? "").trim();
  if (!l && !c) return null;
  if (!c) return l;
  if (!l) return c;
  return `${c} ${l}`;
}

function parseViaje(formData: FormData):
  | { ok: true; row: { fecha: string; origen: string | null; destino: string | null; km: number | null; vehiculo_id: string | null } }
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
  // Camión (opcional): solo se guarda si es un uuid válido.
  const vehiculo_id = d.vehiculo_id && z.string().uuid().safeParse(d.vehiculo_id).success ? d.vehiculo_id : null;
  return {
    ok: true,
    row: { fecha: d.fecha, origen: conCp(d.origen, d.cp_origen), destino: conCp(d.destino, d.cp_destino), km, vehiculo_id },
  };
}

// ─── PORTE (carga de un cliente: lo que se factura) ───────────────────────────
// Un porte llega como objeto: { client_id, origenes:[{lugar,cp}], destinos:[...],
// descripcion, peso, peso_unidad, importe }. Las cargas/descargas (grupaje) se
// apilan con salto de línea; si no traen ruta propia, heredan la del trayecto.
type StopDraft = { lugar?: string; cp?: string };
function porteRowFromDraft(
  d: Record<string, unknown>,
  fb: { origen: string | null; destino: string | null },
): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const client_id = typeof d?.client_id === "string" ? d.client_id : "";
  if (!z.string().uuid().safeParse(client_id).success) return { ok: false, error: "Cada porte necesita un cliente." };

  const importe = num(String(d?.importe ?? ""));
  if (!Number.isFinite(importe) || importe <= 0) return { ok: false, error: "Cada porte necesita un importe mayor que 0." };

  // Topes anti-abuso: máx. 30 paradas por lista y longitudes acotadas por parada.
  const asList = (x: unknown) =>
    Array.isArray(x)
      ? x
          .slice(0, 30)
          .map((s) => conCp((s as StopDraft)?.lugar?.slice(0, 120), (s as StopDraft)?.cp?.slice(0, 12)))
          .filter((t): t is string => Boolean(t))
      : [];
  const origenes = asList(d?.origenes);
  const destinos = asList(d?.destinos);
  const origen = origenes.length ? origenes.join("\n") : fb.origen;
  const destino = destinos.length ? destinos.join("\n") : fb.destino;

  const descripcion = String(d?.descripcion ?? "").trim().slice(0, 300) || null;
  const pesoStr = String(d?.peso ?? "").trim();
  let peso: number | null = null;
  if (pesoStr !== "") {
    const pn = num(pesoStr);
    if (!Number.isFinite(pn) || pn < 0) return { ok: false, error: "Peso de un porte no válido." };
    peso = pn;
  }
  const peso_unidad = d?.peso_unidad === "t" ? "t" : "kg";

  return { ok: true, row: { client_id, origen, destino, descripcion, peso, peso_unidad, importe } };
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
  if (drafts.length > 50) return { error: "Demasiados portes en un viaje (máximo 50)." };

  const rows: Record<string, unknown>[] = [];
  for (const d of drafts as Record<string, unknown>[]) {
    const r = porteRowFromDraft(d, { origen: v.row.origen, destino: v.row.destino });
    if (!r.ok) return { error: r.error };
    rows.push(r.row);
  }

  // Propiedad de los clientes: cada client_id referenciado debe ser del usuario
  // (la FK solo comprueba que exista, no que sea suyo).
  const clientIds = [...new Set(rows.map((r) => String(r.client_id)))];
  const { data: ownedClients } = await supabase.from("clients").select("id").eq("user_id", user.id).in("id", clientIds);
  if ((ownedClients?.length ?? 0) !== clientIds.length) return { error: "Algún cliente no es válido." };

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

  let draft: unknown;
  try {
    draft = JSON.parse(String(formData.get("porte") ?? "{}"));
  } catch {
    return { error: "Porte no válido." };
  }
  const p = porteRowFromDraft(draft as Record<string, unknown>, { origen: viaje.origen, destino: viaje.destino });
  if (!p.ok) return { error: p.error };

  const { data: oc } = await supabase.from("clients").select("id").eq("id", p.row.client_id as string).eq("user_id", user.id).maybeSingle();
  if (!oc) return { error: "Cliente no válido." };

  const { error } = await supabase
    .from("trips")
    .insert({ ...p.row, fecha: viaje.fecha, viaje_id: viajeId, user_id: user.id, estado: "pendiente" });
  if (error) return { error: "No se pudo añadir el porte." };

  revalidatePath("/viajes");
  revalidatePath(`/viajes/${viajeId}`);
  redirect(`/viajes/${viajeId}`);
}

// ─── Editar un porte (solo mientras NO esté facturado) ────────────────────────
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
  if (existing.estado === "facturado") return { error: "No puedes editar un porte ya facturado." };

  // Ruta de respaldo: la del viaje al que pertenece (si el porte no trae ruta).
  let fb: { origen: string | null; destino: string | null } = { origen: null, destino: null };
  if (existing.viaje_id) {
    const { data: viaje } = await supabase
      .from("viajes")
      .select("origen, destino")
      .eq("id", existing.viaje_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (viaje) fb = { origen: viaje.origen, destino: viaje.destino };
  }

  let draft: unknown;
  try {
    draft = JSON.parse(String(formData.get("porte") ?? "{}"));
  } catch {
    return { error: "Porte no válido." };
  }
  const p = porteRowFromDraft(draft as Record<string, unknown>, fb);
  if (!p.ok) return { error: p.error };

  const { data: oc } = await supabase.from("clients").select("id").eq("id", p.row.client_id as string).eq("user_id", user.id).maybeSingle();
  if (!oc) return { error: "Cliente no válido." };

  // El .eq("estado","pendiente") evita pisar un porte que se facturara entremedias.
  const { error } = await supabase
    .from("trips")
    .update(p.row)
    .eq("id", porteId)
    .eq("user_id", user.id)
    .eq("estado", "pendiente");
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
