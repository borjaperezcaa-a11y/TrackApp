"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/events";

const schema = z.object({
  serie: z.string().trim().min(1, "Indica la serie de la factura").max(80),
  numero: z.string().trim().min(1, "Indica el número de la factura").max(60),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  cliente: z.string().trim().max(160).nullable(),
  cliente_nif: z.string().trim().max(40).nullable(),
  concepto: z.string().trim().max(300).nullable(),
  base: z.number().min(0).max(10_000_000),
  iva_rate: z.number().min(0).max(100).nullable(),
  iva: z.number().min(0).max(10_000_000),
  irpf_rate: z.number().min(0).max(100).nullable(),
  irpf: z.number().min(0).max(10_000_000),
  total: z.number().min(0).max(10_000_000),
  cobrada: z.boolean(),
  archivo_path: z.string().max(500).nullable(),
  notas: z.string().trim().max(500).nullable(),
}).refine((d) => Math.abs(d.total - (d.base + d.iva - d.irpf)) <= 0.01, {
  message: "El total no cuadra: debe ser base + IVA − IRPF.",
  path: ["total"],
});

export type ExternalInvoicePayload = z.infer<typeof schema>;
export type ExternalInvoiceState = { error?: string };

function toRow(d: ExternalInvoicePayload, userId: string) {
  return {
    user_id: userId,
    serie: d.serie,
    numero: d.numero,
    fecha: d.fecha,
    cliente: d.cliente || null,
    cliente_nif: d.cliente_nif || null,
    concepto: d.concepto || null,
    base: d.base,
    iva_rate: d.iva_rate,
    iva: d.iva,
    irpf_rate: d.irpf_rate,
    irpf: d.irpf,
    total: d.total,
    cobrada: d.cobrada,
    archivo_url: d.archivo_path,
    notas: d.notas || null,
  };
}

function revalidate() {
  revalidatePath("/facturas/externas");
  revalidatePath("/facturas");
  revalidatePath("/");
  revalidatePath("/estadisticas");
}

export async function createExternalInvoiceAction(
  payload: ExternalInvoicePayload,
): Promise<ExternalInvoiceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { data: inserted, error } = await supabase
    .from("external_invoices")
    .insert(toRow(parsed.data, user.id))
    .select("id")
    .single();
  if (error) return { error: "No se pudo guardar la factura." };

  await logEvent(supabase, "factura_externa_registrada", {
    detalle: { numero: parsed.data.numero, total: parsed.data.total, serie: parsed.data.serie },
    entidad: "factura_externa",
    entidadId: inserted?.id as string | undefined,
  });

  revalidate();
  redirect("/facturas/externas");
}

export async function updateExternalInvoiceAction(
  id: string,
  payload: ExternalInvoicePayload,
): Promise<ExternalInvoiceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { error } = await supabase
    .from("external_invoices")
    .update(toRow(parsed.data, user.id))
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudieron guardar los cambios." };

  await logEvent(supabase, "factura_externa_editada", {
    detalle: { numero: parsed.data.numero },
    entidad: "factura_externa",
    entidadId: id,
  });

  revalidate();
  redirect("/facturas/externas");
}

export async function deleteExternalInvoiceAction(
  id: string,
  _prev: ExternalInvoiceState,
  _formData: FormData,
): Promise<ExternalInvoiceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const { error } = await supabase
    .from("external_invoices")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar la factura." };

  await logEvent(supabase, "factura_externa_borrada", {
    entidad: "factura_externa",
    entidadId: id,
  });

  revalidate();
  redirect("/facturas/externas");
}
