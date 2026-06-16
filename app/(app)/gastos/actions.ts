"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_CATEGORIES } from "@/lib/expense";

const expenseSchema = z.object({
  categoria: z.enum([...EXPENSE_CATEGORIES] as [string, ...string[]]),
  estacion: z.string().trim().max(160),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  base: z.number().min(0).max(10_000_000).nullable(),
  iva: z.number().min(0).max(10_000_000).nullable(),
  total: z.number().gt(0, "El importe debe ser mayor que 0").max(10_000_000),
  trip_id: z.string().uuid().nullable(),
  foto_path: z.string().max(500).nullable(),
});

export type ExpensePayload = z.infer<typeof expenseSchema>;
export type ExpenseState = { error?: string };

function toRow(d: ExpensePayload, userId: string) {
  return {
    user_id: userId,
    categoria: d.categoria,
    estacion: d.estacion || null,
    fecha: d.fecha,
    base: d.base,
    iva: d.iva,
    total: d.total,
    trip_id: d.trip_id,
    foto_url: d.foto_path,
  };
}

export async function createExpenseAction(payload: ExpensePayload): Promise<ExpenseState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = expenseSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { error } = await supabase.from("expenses").insert(toRow(parsed.data, user.id));
  if (error) return { error: "No se pudo guardar el gasto." };

  revalidatePath("/gastos");
  revalidatePath("/");
  revalidatePath("/estadisticas");
  redirect("/gastos");
}

export async function updateExpenseAction(
  id: string,
  payload: ExpensePayload,
): Promise<ExpenseState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = expenseSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { error } = await supabase
    .from("expenses")
    .update(toRow(parsed.data, user.id))
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudieron guardar los cambios." };

  revalidatePath("/gastos");
  revalidatePath("/");
  revalidatePath("/estadisticas");
  redirect("/gastos");
}

export async function deleteExpenseAction(
  id: string,
  _prev: ExpenseState,
  _formData: FormData,
): Promise<ExpenseState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const { error } = await supabase.from("expenses").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar el gasto." };

  revalidatePath("/gastos");
  revalidatePath("/");
  revalidatePath("/estadisticas");
  redirect("/gastos");
}
