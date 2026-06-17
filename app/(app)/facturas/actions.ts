"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/events";
import type { EmitPayload, EmitResult } from "./types";

const lineSchema = z.object({
  trip_id: z.string().uuid().nullable(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de línea no válida"),
  origen: z.string().max(200),
  destino: z.string().max(200),
  cantidad: z.number().positive("La cantidad debe ser mayor que 0").max(1_000_000),
  precio: z.number().min(0).max(10_000_000),
});

const str = z.string().max(200);

const payloadSchema = z.object({
  clientId: z.string().uuid("Cliente no válido"),
  tripIds: z.array(z.string().uuid()).min(1, "Selecciona al menos un viaje"),
  ivaRate: z.number().min(0).max(100),
  irpfRate: z.number().min(0).max(100),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  formaPago: z.string().max(60),
  lines: z.array(lineSchema).min(1, "La factura no tiene líneas"),
  emisor: z.object({
    nombre: str,
    nif: str,
    direccion: str,
    cp_localidad: str,
    iban: str,
    logo_url: z.string().max(500),
  }),
  cliente: z.object({
    nombre: str,
    nif: str,
    direccion: str,
    cp_localidad: str,
    condiciones_pago: str,
  }),
});

export async function emitInvoiceAction(payload: EmitPayload): Promise<EmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Vuelve a entrar." };

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }
  const p = parsed.data;

  const { data, error } = await supabase.rpc("emit_invoice_from_trips", {
    p_client_id: p.clientId,
    p_trip_ids: p.tripIds,
    p_iva_rate: p.ivaRate,
    p_irpf_rate: p.irpfRate,
    p_fecha: p.fecha,
    p_forma_pago: p.formaPago || "Transferencia",
    p_lines: p.lines,
    p_emisor: p.emisor,
    p_cliente: p.cliente,
  });

  if (error) {
    // Solo se muestran al cliente los mensajes controlados de la función (en
    // español). Cualquier otro error de BD se registra y se devuelve genérico
    // (no filtrar detalles internos del esquema).
    const known = [
      "No autenticado",
      "Perfil no encontrado",
      "No hay viajes seleccionados",
      "Cliente no válido",
      "Algún viaje no es válido",
      "Completa tus datos de emisor",
    ];
    const msg = error.message ?? "";
    if (known.some((k) => msg.includes(k))) return { error: msg };
    // Violación de unicidad (numeración/cadena): dos emisiones a la vez. La BD lo
    // impide (no se duplica), y reintentar resuelve. Mensaje claro en vez de genérico.
    if (error.code === "23505") {
      return { error: "Se emitió otra factura a la vez. Vuelve a pulsar Emitir." };
    }
    console.error("[emitInvoice] error:", error.code, error.message);
    return { error: "No se pudo emitir la factura. Inténtalo de nuevo." };
  }

  const invoice = Array.isArray(data) ? data[0] : data;
  if (!invoice?.id) return { error: "La emisión no devolvió la factura." };

  await logEvent(supabase, "factura_emitida", {
    detalle: { numero: invoice.numero, total: invoice.total },
    entidad: "factura",
    entidadId: invoice.id as string,
  });

  revalidatePath("/facturas");
  revalidatePath("/viajes");
  revalidatePath("/");
  return { invoiceId: invoice.id as string };
}

export async function emitRectificativaAction(
  originalId: string,
  motivo: string,
): Promise<EmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  if (!z.string().uuid().safeParse(originalId).success) {
    return { error: "Factura no válida." };
  }

  const { data, error } = await supabase.rpc("emit_rectificativa", {
    p_original_id: originalId,
    p_motivo: motivo?.trim().slice(0, 300) || null,
  });

  if (error) {
    const known = [
      "No autenticado",
      "Perfil no encontrado",
      "Factura no encontrada",
      "Solo se pueden rectificar",
      "Esta factura ya tiene una rectificativa",
    ];
    const msg = error.message ?? "";
    if (known.some((k) => msg.includes(k))) return { error: msg };
    console.error("[emitRectificativa] error:", error.code, error.message);
    return { error: "No se pudo emitir la rectificativa. Inténtalo de nuevo." };
  }

  const inv = Array.isArray(data) ? data[0] : data;
  if (!inv?.id) return { error: "No se pudo crear la rectificativa." };

  await logEvent(supabase, "factura_anulada", {
    detalle: { numero: inv.numero, original: originalId, motivo: motivo?.trim().slice(0, 300) || null },
    entidad: "factura",
    entidadId: inv.id as string,
  });

  revalidatePath("/facturas");
  revalidatePath("/viajes");
  revalidatePath("/");
  return { invoiceId: inv.id as string };
}

const corrLineSchema = z.object({
  cantidad: z.number().min(0).max(1_000_000),
  precio: z.number().min(0).max(10_000_000),
});

export async function emitRectificativaDifAction(
  originalId: string,
  lines: { cantidad: number; precio: number }[],
  motivo: string,
): Promise<EmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  if (!z.string().uuid().safeParse(originalId).success) return { error: "Factura no válida." };
  const parsedLines = z.array(corrLineSchema).min(1).max(500).safeParse(lines);
  if (!parsedLines.success) return { error: "Importes no válidos." };

  const { data, error } = await supabase.rpc("emit_rectificativa_dif", {
    p_original_id: originalId,
    p_lines: parsedLines.data,
    p_motivo: motivo?.trim().slice(0, 300) || null,
  });

  if (error) {
    const known = [
      "No autenticado",
      "Perfil no encontrado",
      "Factura no encontrada",
      "Solo se pueden rectificar",
      "Esta factura ya tiene una rectificativa",
      "Las líneas corregidas no cuadran",
      "No hay cambios de importe",
    ];
    const msg = error.message ?? "";
    if (known.some((k) => msg.includes(k))) return { error: msg };
    console.error("[emitRectificativaDif] error:", error.code, error.message);
    return { error: "No se pudo emitir la rectificativa. Inténtalo de nuevo." };
  }

  const inv = Array.isArray(data) ? data[0] : data;
  if (!inv?.id) return { error: "No se pudo crear la rectificativa." };

  await logEvent(supabase, "factura_rectificada", {
    detalle: { numero: inv.numero, original: originalId, motivo: motivo?.trim().slice(0, 300) || null },
    entidad: "factura",
    entidadId: inv.id as string,
  });

  revalidatePath("/facturas");
  revalidatePath("/");
  return { invoiceId: inv.id as string };
}

export async function togglePaidAction(id: string, pagada: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // .select() para comprobar que se actualizó realmente una fila (si el id no
  // existe o es de otro usuario, RLS deja 0 filas: no lo damos por bueno).
  const { data, error } = await supabase
    .from("invoices")
    .update({ pagada })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return { error: "No se pudo actualizar el estado de pago." };
  if (!data || data.length === 0) return { error: "No se encontró la factura." };

  revalidatePath(`/facturas/${id}`);
  revalidatePath("/facturas");
  return {};
}
