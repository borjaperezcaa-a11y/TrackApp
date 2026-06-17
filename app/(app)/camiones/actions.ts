"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const vehiculoSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  matricula: z.string().trim().max(20),
});

export type VehiculoState = { error?: string };

function parse(formData: FormData) {
  return vehiculoSchema.safeParse(Object.fromEntries(formData));
}
function toRow(d: z.infer<typeof vehiculoSchema>) {
  return { nombre: d.nombre, matricula: d.matricula || null };
}

export async function createVehiculoAction(_prev: VehiculoState, formData: FormData): Promise<VehiculoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { error } = await supabase.from("vehiculos").insert({ ...toRow(parsed.data), user_id: user.id });
  if (error) return { error: "No se pudo crear el camión." };

  revalidatePath("/camiones");
  redirect("/camiones");
}

export async function updateVehiculoAction(id: string, _prev: VehiculoState, formData: FormData): Promise<VehiculoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { error } = await supabase.from("vehiculos").update(toRow(parsed.data)).eq("id", id).eq("user_id", user.id);
  if (error) return { error: "No se pudieron guardar los cambios." };

  revalidatePath("/camiones");
  redirect("/camiones");
}

export async function deleteVehiculoAction(id: string, _prev: VehiculoState, _formData: FormData): Promise<VehiculoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Los viajes que lo usaban no se pierden: su vehiculo_id queda a NULL (FK on delete set null).
  const { error } = await supabase.from("vehiculos").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar el camión." };

  revalidatePath("/camiones");
  redirect("/camiones");
}
