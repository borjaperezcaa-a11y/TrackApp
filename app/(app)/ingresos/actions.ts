"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const incomeSchema = z.object({
  concepto: z.string().trim().max(200),
  cliente: z.string().trim().max(160),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  base: z.number().min(0).max(10_000_000).nullable(),
  iva_rate: z.number().min(0).max(100).nullable(),
  iva: z.number().min(0).max(10_000_000).nullable(),
  total: z.number().gt(0, "El importe debe ser mayor que 0").max(10_000_000),
  cobrada: z.boolean(),
  notas: z.string().trim().max(500),
});

export type IncomePayload = z.infer<typeof incomeSchema>;
export type IncomeState = { error?: string };

function toRow(d: IncomePayload, userId: string) {
  return {
    user_id: userId,
    concepto: d.concepto || null,
    cliente: d.cliente || null,
    fecha: d.fecha,
    base: d.base,
    iva_rate: d.iva_rate,
    iva: d.iva,
    total: d.total,
    cobrada: d.cobrada,
    notas: d.notas || null,
  };
}

function revalidate() {
  revalidatePath("/ingresos");
  revalidatePath("/");
  revalidatePath("/estadisticas");
}

export async function createIncomeAction(payload: IncomePayload): Promise<IncomeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = incomeSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { error } = await supabase.from("incomes").insert(toRow(parsed.data, user.id));
  if (error) return { error: "No se pudo guardar el ingreso." };

  revalidate();
  redirect("/ingresos");
}

export async function updateIncomeAction(id: string, payload: IncomePayload): Promise<IncomeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = incomeSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { error } = await supabase
    .from("incomes")
    .update(toRow(parsed.data, user.id))
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudieron guardar los cambios." };

  revalidate();
  redirect("/ingresos");
}

export async function deleteIncomeAction(
  id: string,
  _prev: IncomeState,
  _formData: FormData,
): Promise<IncomeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const { error } = await supabase.from("incomes").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar el ingreso." };

  revalidate();
  redirect("/ingresos");
}
