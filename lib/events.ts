import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Registro de eventos (Art. 8.3 RD 1007/2023). Llama a la función `log_event`
 * que escribe en `system_events` (solo-anexable + cadena de huellas). Es
 * best-effort: si fallara, no debe tumbar la operación del usuario (la factura
 * ya se emitió), pero se loguea en servidor para diagnóstico.
 */
export type EventTipo =
  | "factura_emitida"
  | "factura_anulada"
  | "factura_rectificada"
  | "factura_externa_registrada"
  | "factura_externa_editada"
  | "factura_externa_borrada"
  | "numeracion_configurada";

export async function logEvent(
  supabase: SupabaseClient,
  tipo: EventTipo,
  opts?: { detalle?: Record<string, unknown>; entidad?: string; entidadId?: string },
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_event", {
      p_tipo: tipo,
      p_detalle: opts?.detalle ?? {},
      p_entidad: opts?.entidad ?? null,
      p_entidad_id: opts?.entidadId ?? null,
    });
    if (error) console.error("[logEvent]", tipo, error.message);
  } catch (e) {
    console.error("[logEvent]", tipo, e);
  }
}
