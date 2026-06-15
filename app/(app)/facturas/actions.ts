"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { EmitPayload, EmitResult } from "./types";

const lineSchema = z.object({
  trip_id: z.string().uuid().nullable(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de línea no válida"),
  origen: z.string().max(200),
  destino: z.string().max(200),
  cantidad: z.number().min(0).max(1_000_000),
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
    console.error("[emitInvoice] error:", error.code, error.message);
    return { error: "No se pudo emitir la factura. Inténtalo de nuevo." };
  }

  const invoice = Array.isArray(data) ? data[0] : data;
  if (!invoice?.id) return { error: "La emisión no devolvió la factura." };

  revalidatePath("/facturas");
  revalidatePath("/viajes");
  revalidatePath("/");
  return { invoiceId: invoice.id as string };
}

export async function togglePaidAction(id: string, pagada: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const { error } = await supabase
    .from("invoices")
    .update({ pagada })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo actualizar el estado de pago." };

  revalidatePath(`/facturas/${id}`);
  revalidatePath("/facturas");
  return {};
}
