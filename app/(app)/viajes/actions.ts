"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseDecimal } from "@/lib/format";

const tripSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  client_id: z.string().uuid("Selecciona un cliente"),
  origen: z.string().trim().max(160),
  destino: z.string().trim().max(160),
  descripcion: z.string().trim().max(300),
  peso: z.string().trim(),
  peso_unidad: z.enum(["t", "kg"]).default("t"),
  km: z.string().trim(),
  importe: z.string().trim(),
});

export type TripState = { error?: string };

const num = parseDecimal;

function parseTrip(formData: FormData):
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string } {
  const parsed = tripSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const d = parsed.data;

  const importe = num(d.importe);
  if (!Number.isFinite(importe) || importe <= 0)
    return { ok: false, error: "El importe debe ser mayor que 0" };

  let km: number | null = null;
  if (d.km !== "") {
    const k = num(d.km);
    if (!Number.isFinite(k) || k < 0) return { ok: false, error: "Km no válidos" };
    km = k;
  }

  let peso: number | null = null;
  if (d.peso !== "") {
    const p = num(d.peso);
    if (!Number.isFinite(p) || p < 0) return { ok: false, error: "Peso no válido" };
    peso = p;
  }

  return {
    ok: true,
    row: {
      fecha: d.fecha,
      client_id: d.client_id,
      origen: d.origen || null,
      destino: d.destino || null,
      descripcion: d.descripcion || null,
      peso,
      peso_unidad: d.peso_unidad,
      km,
      importe,
    },
  };
}

export async function createTripAction(_prev: TripState, formData: FormData): Promise<TripState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const r = parseTrip(formData);
  if (!r.ok) return { error: r.error };

  const { error } = await supabase
    .from("trips")
    .insert({ ...r.row, user_id: user.id, estado: "pendiente" });
  if (error) return { error: "No se pudo crear el viaje." };

  revalidatePath("/viajes");
  redirect("/viajes");
}

export async function updateTripAction(
  id: string,
  _prev: TripState,
  formData: FormData,
): Promise<TripState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Guarda: un viaje facturado es inmutable (ya está en una factura emitida).
  const { data: existing } = await supabase
    .from("trips")
    .select("estado")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return { error: "Viaje no encontrado." };
  if (existing.estado === "facturado") {
    return { error: "Este viaje ya está facturado y no se puede editar." };
  }

  const r = parseTrip(formData);
  if (!r.ok) return { error: r.error };

  const { error } = await supabase.from("trips").update(r.row).eq("id", id).eq("user_id", user.id);
  if (error) return { error: "No se pudieron guardar los cambios." };

  revalidatePath("/viajes");
  redirect("/viajes");
}

export async function deleteTripAction(
  id: string,
  _prev: TripState,
  _formData: FormData,
): Promise<TripState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const { data: existing } = await supabase
    .from("trips")
    .select("estado")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return { error: "Viaje no encontrado." };
  if (existing.estado === "facturado") {
    return { error: "No puedes borrar un viaje ya facturado." };
  }

  const { error } = await supabase.from("trips").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar el viaje." };

  revalidatePath("/viajes");
  redirect("/viajes");
}
